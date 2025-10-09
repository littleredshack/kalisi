use edt_gateway::graph::{GraphClient, Node, Relationship};
use neo4rs::*;
use serde_json::json;

async fn setup_test_graph() -> GraphClient {
    // Use test database
    GraphClient::new_test()
        .await
        .expect("Failed to create test graph client")
}

#[tokio::test]
async fn test_create_and_get_node() {
    let client = setup_test_graph().await;

    // Create a test node
    let properties = json!({
        "name": "Test Node",
        "type": "TestType",
        "created_at": "2024-01-01T00:00:00Z"
    });

    let node = client
        .create_node("TestLabel", properties.clone())
        .await
        .expect("Failed to create node");

    assert!(node.id > 0);
    assert_eq!(node.labels, vec!["TestLabel"]);
    assert_eq!(node.properties["name"], "Test Node");

    // Get the node back
    let retrieved = client
        .get_node(node.id)
        .await
        .expect("Failed to get node")
        .expect("Node not found");

    assert_eq!(retrieved.id, node.id);
    assert_eq!(retrieved.properties["name"], "Test Node");
}

#[tokio::test]
async fn test_create_relationship() {
    let client = setup_test_graph().await;

    // Create two nodes
    let node1 = client
        .create_node("Person", json!({"name": "Alice"}))
        .await
        .expect("Failed to create node 1");

    let node2 = client
        .create_node("Person", json!({"name": "Bob"}))
        .await
        .expect("Failed to create node 2");

    // Create relationship
    let rel_props = json!({"since": "2024-01-01"});
    let relationship = client
        .create_relationship(node1.id, node2.id, "KNOWS", rel_props.clone())
        .await
        .expect("Failed to create relationship");

    assert!(relationship.id > 0);
    assert_eq!(relationship.rel_type, "KNOWS");
    assert_eq!(relationship.start_node_id, node1.id);
    assert_eq!(relationship.end_node_id, node2.id);
    assert_eq!(relationship.properties["since"], "2024-01-01");
}

#[tokio::test]
async fn test_update_node() {
    let client = setup_test_graph().await;

    // Create a node
    let original = client
        .create_node("Document", json!({"title": "Original Title"}))
        .await
        .expect("Failed to create node");

    // Update it
    let updated_props = json!({
        "title": "Updated Title",
        "modified_at": "2024-01-02T00:00:00Z"
    });

    let updated = client
        .update_node(original.id, updated_props)
        .await
        .expect("Failed to update node");

    assert_eq!(updated.id, original.id);
    assert_eq!(updated.properties["title"], "Updated Title");
    assert!(updated.properties.contains_key("modified_at"));
}

#[tokio::test]
async fn test_delete_node() {
    let client = setup_test_graph().await;

    // Create a node
    let node = client
        .create_node("Temporary", json!({"temp": true}))
        .await
        .expect("Failed to create node");

    // Delete it
    client
        .delete_node(node.id)
        .await
        .expect("Failed to delete node");

    // Verify it's gone
    let result = client.get_node(node.id).await.expect("Query failed");
    assert!(result.is_none());
}

#[tokio::test]
async fn test_find_nodes_by_label() {
    let client = setup_test_graph().await;

    // Create multiple nodes with same label
    for i in 0..3 {
        client
            .create_node("TestGroup", json!({"index": i}))
            .await
            .expect("Failed to create node");
    }

    // Find them
    let nodes = client
        .find_nodes_by_label("TestGroup")
        .await
        .expect("Failed to find nodes");

    assert!(nodes.len() >= 3);
    assert!(nodes
        .iter()
        .all(|n| n.labels.contains(&"TestGroup".to_string())));
}

#[tokio::test]
async fn test_execute_cypher_query() {
    let client = setup_test_graph().await;

    // Create test data
    let query = r#"
        CREATE (a:Person {name: 'Alice', age: 30})
        CREATE (b:Person {name: 'Bob', age: 25})
        CREATE (c:Person {name: 'Charlie', age: 35})
        CREATE (a)-[:KNOWS]->(b)
        CREATE (b)-[:KNOWS]->(c)
        RETURN a, b, c
    "#;

    client
        .execute_query(query)
        .await
        .expect("Failed to execute setup query");

    // Query the data
    let result_query = r#"
        MATCH (p:Person)
        WHERE p.age > 25
        RETURN p.name as name, p.age as age
        ORDER BY p.age DESC
    "#;

    let mut result = client
        .client
        .execute(neo4rs::query(result_query))
        .await
        .expect("Failed to execute query");

    let mut names = Vec::new();
    while let Ok(Some(row)) = result.next().await {
        let name: String = row.get("name").unwrap();
        let age: i64 = row.get("age").unwrap();
        names.push((name, age));
    }

    assert_eq!(names.len(), 2);
    assert_eq!(names[0].0, "Charlie");
    assert_eq!(names[0].1, 35);
    assert_eq!(names[1].0, "Alice");
    assert_eq!(names[1].1, 30);
}

#[tokio::test]
async fn test_shortest_path() {
    let client = setup_test_graph().await;

    // Create a network
    let query = r#"
        CREATE (a:City {name: 'New York'})
        CREATE (b:City {name: 'Chicago'})
        CREATE (c:City {name: 'Denver'})
        CREATE (d:City {name: 'San Francisco'})
        CREATE (a)-[:ROUTE {distance: 790}]->(b)
        CREATE (b)-[:ROUTE {distance: 920}]->(c)
        CREATE (c)-[:ROUTE {distance: 950}]->(d)
        CREATE (a)-[:ROUTE {distance: 2900}]->(d)
        RETURN a, d
    "#;

    let mut result = client
        .client
        .execute(neo4rs::query(query))
        .await
        .expect("Failed to create network");

    let row = result.next().await.unwrap().unwrap();
    let start_node: neo4rs::Node = row.get("a").unwrap();
    let end_node: neo4rs::Node = row.get("d").unwrap();

    // Find shortest path
    let path_query = r#"
        MATCH (start:City {name: $start_name}),
              (end:City {name: $end_name}),
              path = shortestPath((start)-[:ROUTE*]-(end))
        RETURN path
    "#;

    let mut path_result = client
        .client
        .execute(
            neo4rs::query(path_query)
                .param("start_name", "New York")
                .param("end_name", "San Francisco"),
        )
        .await
        .expect("Failed to find path");

    assert!(path_result.next().await.unwrap().is_some());
}

#[tokio::test]
async fn test_transaction_rollback() {
    let client = setup_test_graph().await;

    // Start a transaction
    let txn = client
        .client
        .start_txn()
        .await
        .expect("Failed to start transaction");

    // Create a node in the transaction
    let query = "CREATE (n:TransactionTest {name: 'Should be rolled back'}) RETURN n";
    txn.run(neo4rs::query(query))
        .await
        .expect("Failed to create node in transaction");

    // Rollback
    txn.rollback().await.expect("Failed to rollback");

    // Verify the node doesn't exist
    let check_query = "MATCH (n:TransactionTest) RETURN count(n) as count";
    let mut result = client
        .client
        .execute(neo4rs::query(check_query))
        .await
        .expect("Failed to check for node");

    let row = result.next().await.unwrap().unwrap();
    let count: i64 = row.get("count").unwrap();
    assert_eq!(count, 0);
}

#[tokio::test]
async fn test_complex_graph_pattern() {
    let client = setup_test_graph().await;

    // Create a social network pattern
    let setup_query = r#"
        CREATE (alice:Person {name: 'Alice', age: 30})
        CREATE (bob:Person {name: 'Bob', age: 25})
        CREATE (charlie:Person {name: 'Charlie', age: 35})
        CREATE (dave:Person {name: 'Dave', age: 28})
        
        CREATE (tech:Interest {name: 'Technology'})
        CREATE (music:Interest {name: 'Music'})
        CREATE (sports:Interest {name: 'Sports'})
        
        CREATE (alice)-[:KNOWS {since: 2020}]->(bob)
        CREATE (bob)-[:KNOWS {since: 2021}]->(charlie)
        CREATE (charlie)-[:KNOWS {since: 2019}]->(dave)
        CREATE (dave)-[:KNOWS {since: 2022}]->(alice)
        
        CREATE (alice)-[:INTERESTED_IN]->(tech)
        CREATE (alice)-[:INTERESTED_IN]->(music)
        CREATE (bob)-[:INTERESTED_IN]->(tech)
        CREATE (charlie)-[:INTERESTED_IN]->(sports)
        CREATE (dave)-[:INTERESTED_IN]->(music)
    "#;

    client
        .execute_query(setup_query)
        .await
        .expect("Failed to create social network");

    // Find people with common interests
    let common_interests_query = r#"
        MATCH (p1:Person)-[:INTERESTED_IN]->(i:Interest)<-[:INTERESTED_IN]-(p2:Person)
        WHERE p1.name < p2.name
        RETURN p1.name as person1, p2.name as person2, i.name as common_interest
        ORDER BY person1, person2
    "#;

    let mut result = client
        .client
        .execute(neo4rs::query(common_interests_query))
        .await
        .expect("Failed to find common interests");

    let mut connections = Vec::new();
    while let Ok(Some(row)) = result.next().await {
        let person1: String = row.get("person1").unwrap();
        let person2: String = row.get("person2").unwrap();
        let interest: String = row.get("common_interest").unwrap();
        connections.push((person1, person2, interest));
    }

    assert!(!connections.is_empty());
    // Alice and Bob both like Technology
    assert!(connections
        .iter()
        .any(|(p1, p2, i)| p1 == "Alice" && p2 == "Bob" && i == "Technology"));
    // Alice and Dave both like Music
    assert!(connections
        .iter()
        .any(|(p1, p2, i)| p1 == "Alice" && p2 == "Dave" && i == "Music"));
}
