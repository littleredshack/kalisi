use std::collections::{HashMap, HashSet};

use serde_json::{Map, Value};

use crate::database::neo4j_gateway::GatewayQueryResult;

use super::dto::{
    BadgeDisplay, CanvasGraphDto, CanvasNodeDto, CanvasRelationshipDto, NodeDisplay, NodePosition,
    QueryMetadataDto, RelationshipDisplay,
};

const GUID_KEYS: &[&str] = &["GUID", "guid", "id", "elementId", "element_id", "identity"];
const PARENT_KEYS: &[&str] = &["parentGUID", "parent_guid", "parentId"];
const SOURCE_KEYS: &[&str] = &[
    "fromGUID",
    "fromGuid",
    "from_guid",
    "sourceGuid",
    "source_guid",
];
const TARGET_KEYS: &[&str] = &["toGUID", "toGuid", "to_guid", "targetGuid", "target_guid"];
const REL_GUID_KEYS: &[&str] = &["GUID", "guid", "relationshipId", "relationship_id"];
const FORBIDDEN_FIELDS: &[&str] = &[
    "id",
    "identity",
    "elementId",
    "element_id",
    "startNodeId",
    "startNodeElementId",
    "startNode",
    "endNodeId",
    "endNodeElementId",
    "endNode",
    "nodeId",
    "relationshipId",
];

pub fn build_canvas_response(
    query_id: String,
    cypher: String,
    parameters: HashMap<String, Value>,
    result: GatewayQueryResult,
    include_raw_rows: bool,
) -> CanvasGraphDto {
    let rows = result
        .raw_response
        .get("results")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();

    let (nodes, relationships) = harvest_graph_entities(&rows);

    let metadata = QueryMetadataDto {
        elapsed_ms: result.metrics.elapsed_ms,
        rows_returned: result.metrics.result_count,
    };

    let raw_rows = if include_raw_rows {
        Some(
            rows.into_iter()
                .map(sanitise_internal_ids)
                .collect::<Vec<_>>(),
        )
    } else {
        None
    };

    CanvasGraphDto {
        query_id,
        cypher,
        parameters,
        nodes,
        relationships,
        metadata,
        telemetry_cursor: None,
        raw_rows,
    }
}

fn harvest_graph_entities(rows: &[Value]) -> (Vec<CanvasNodeDto>, Vec<CanvasRelationshipDto>) {
    let mut node_map: HashMap<String, CanvasNodeDto> = HashMap::new();
    let mut rel_map: HashMap<String, CanvasRelationshipDto> = HashMap::new();

    for row in rows {
        visit_value(row, &mut node_map, &mut rel_map);
    }

    (
        node_map.into_values().collect(),
        rel_map.into_values().collect(),
    )
}

fn visit_value(
    value: &Value,
    node_map: &mut HashMap<String, CanvasNodeDto>,
    rel_map: &mut HashMap<String, CanvasRelationshipDto>,
) {
    match value {
        Value::Object(object) => {
            if let Some(node) = build_node(object) {
                node_map.entry(node.guid.clone()).or_insert(node);
                return;
            }

            if let Some(rel) = build_relationship(object) {
                rel_map.entry(rel.guid.clone()).or_insert(rel);
                return;
            }

            for nested in object.values() {
                visit_value(nested, node_map, rel_map);
            }
        }
        Value::Array(array) => {
            for item in array {
                visit_value(item, node_map, rel_map);
            }
        }
        _ => {}
    }
}

fn build_node(object: &Map<String, Value>) -> Option<CanvasNodeDto> {
    let properties = object.get("properties")?.as_object()?;
    let guid = extract_first_string(properties, GUID_KEYS)?;

    let labels = object
        .get("labels")
        .and_then(|value| value.as_array())
        .map(|array| {
            let mut collected = array
                .iter()
                .filter_map(|value| value.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>();
            collected.sort();
            collected.dedup();
            collected
        })
        .unwrap_or_default();

    let mut position = NodePosition {
        x: 0.0,
        y: 0.0,
        z: None,
    };
    let mut has_position = false;

    let mut display = NodeDisplay {
        width: None,
        height: None,
        color: None,
        icon: None,
        border_color: None,
        badges: Vec::new(),
        label_visible: None,
    };

    let mut tags: HashMap<String, Vec<String>> = HashMap::new();
    let mut cleaned_properties: HashMap<String, Value> = HashMap::new();

    for (key, value) in properties {
        let key_lower = key.to_lowercase();

        match key_lower.as_str() {
            "x" | "y" | "z" => {
                if let Some(number) = value.as_f64() {
                    match key_lower.as_str() {
                        "x" => position.x = number,
                        "y" => position.y = number,
                        "z" => position.z = Some(number),
                        _ => {}
                    }
                    has_position = true;
                }
                continue;
            }
            "width" => {
                display.width = value.as_f64();
                continue;
            }
            "height" => {
                display.height = value.as_f64();
                continue;
            }
            "color" | "colour" => {
                display.color = value.as_str().map(|s| s.to_string());
                continue;
            }
            "icon" => {
                display.icon = value.as_str().map(|s| s.to_string());
                continue;
            }
            "bordercolor" | "border_colour" | "bordercolour" => {
                display.border_color = value.as_str().map(|s| s.to_string());
                continue;
            }
            "labelvisible" | "label_visible" => {
                display.label_visible = value.as_bool();
                continue;
            }
            "badge" | "badges" => {
                collect_badges(value, &mut display.badges);
                continue;
            }
            _ => {}
        }

        if let Some(array) = value.as_array() {
            let tag_values = array
                .iter()
                .filter_map(|value| value.as_str().map(|s| s.to_string()))
                .collect::<Vec<_>>();
            if !tag_values.is_empty() {
                tags.insert(key.clone(), tag_values);
                continue;
            }
        }

        if GUID_KEYS
            .iter()
            .any(|candidate| candidate.eq_ignore_ascii_case(key))
        {
            continue;
        }

        cleaned_properties.insert(key.clone(), value.clone());
    }

    Some(CanvasNodeDto {
        guid,
        labels,
        parent_guid: extract_first_string_map(&cleaned_properties, PARENT_KEYS),
        position: if has_position { Some(position) } else { None },
        display: if display.width.is_some()
            || display.height.is_some()
            || display.color.is_some()
            || display.icon.is_some()
            || display.border_color.is_some()
            || display.label_visible.is_some()
            || !display.badges.is_empty()
        {
            Some(display)
        } else {
            None
        },
        tags,
        properties: cleaned_properties,
    })
}

fn build_relationship(object: &Map<String, Value>) -> Option<CanvasRelationshipDto> {
    let properties = object
        .get("properties")
        .and_then(|value| value.as_object())
        .cloned()
        .unwrap_or_default();

    let source_guid = extract_first_string(&properties, SOURCE_KEYS)?;
    let target_guid = extract_first_string(&properties, TARGET_KEYS)?;
    let rel_type = object
        .get("type")
        .or_else(|| properties.get("type"))
        .and_then(|value| value.as_str().map(|s| s.to_string()))
        .unwrap_or_else(|| "RELATES_TO".to_string());

    let guid = extract_first_string(&properties, REL_GUID_KEYS)
        .unwrap_or_else(|| format!("{}__{}__{}", rel_type, source_guid, target_guid));

    let display = extract_relationship_display(&properties);

    let cleaned_properties = properties
        .into_iter()
        .filter(|(key, _)| {
            let lower = key.to_lowercase();
            !REL_GUID_KEYS
                .iter()
                .any(|candidate| candidate.eq_ignore_ascii_case(key))
                && !matches!(
                    lower.as_str(),
                    "color" | "width" | "label" | "labelvisible" | "label_visible" | "dash"
                )
        })
        .collect::<HashMap<_, _>>();

    Some(CanvasRelationshipDto {
        guid,
        source_guid,
        target_guid,
        r#type: rel_type,
        display,
        properties: cleaned_properties,
    })
}

fn collect_badges(value: &Value, badges: &mut Vec<BadgeDisplay>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_badges(item, badges);
            }
        }
        Value::Object(map) => {
            if let Some(text) = map.get("text").and_then(|v| v.as_str()) {
                let color = map
                    .get("color")
                    .or_else(|| map.get("colour"))
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                badges.push(BadgeDisplay {
                    text: text.to_string(),
                    color,
                });
            }
        }
        Value::String(text) => {
            badges.push(BadgeDisplay {
                text: text.to_string(),
                color: None,
            });
        }
        _ => {}
    }
}

fn extract_relationship_display(
    properties: &Map<String, Value>,
) -> Option<RelationshipDisplay> {
    let mut display = RelationshipDisplay {
        color: None,
        width: None,
        label: None,
        label_visible: None,
        dash: None,
    };

    if let Some(color) = properties.get("color").and_then(|v| v.as_str()) {
        display.color = Some(color.to_string());
    }

    if let Some(width) = properties.get("width").and_then(|v| v.as_f64()) {
        display.width = Some(width);
    }

    if let Some(label) = properties.get("label").and_then(|v| v.as_str()) {
        display.label = Some(label.to_string());
    }

    if let Some(visible) = properties
        .get("labelVisible")
        .or_else(|| properties.get("label_visible"))
        .and_then(|v| v.as_bool())
    {
        display.label_visible = Some(visible);
    }

    if let Some(dash) = properties.get("dash") {
        if let Some(array) = dash.as_array() {
            let pattern = array
                .iter()
                .filter_map(|value| value.as_f64())
                .collect::<Vec<_>>();
            if !pattern.is_empty() {
                display.dash = Some(pattern);
            }
        } else if let Some(text) = dash.as_str() {
            let pattern = text
                .split(',')
                .filter_map(|segment| segment.trim().parse::<f64>().ok())
                .collect::<Vec<_>>();
            if !pattern.is_empty() {
                display.dash = Some(pattern);
            }
        }
    }

    if display.color.is_some()
        || display.width.is_some()
        || display.label.is_some()
        || display.label_visible.is_some()
        || display.dash.is_some()
    {
        Some(display)
    } else {
        None
    }
}

fn extract_first_string(map: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        map.get(*key)
            .and_then(|value| value.as_str().map(|s| s.to_string()))
    })
}

fn extract_first_string_map(map: &HashMap<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        map.get(*key)
            .and_then(|value| value.as_str().map(|s| s.to_string()))
    })
}

fn sanitise_internal_ids(value: Value) -> Value {
    match value {
        Value::Object(mut map) => {
            let keys_to_remove: HashSet<String> = map
                .keys()
                .filter(|key| {
                    FORBIDDEN_FIELDS
                        .iter()
                        .any(|candidate| candidate.eq_ignore_ascii_case(key))
                })
                .cloned()
                .collect();

            for key in keys_to_remove {
                map.remove(&key);
            }

            for nested in map.values_mut() {
                let sanitized = sanitise_internal_ids(nested.clone());
                *nested = sanitized;
            }

            Value::Object(map)
        }
        Value::Array(array) => Value::Array(array.into_iter().map(sanitise_internal_ids).collect()),
        _ => value,
    }
}
