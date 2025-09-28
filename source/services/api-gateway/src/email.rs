#![allow(dead_code)]
use anyhow::Result;
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message,
    transport::smtp::authentication::Credentials,
};
use lettre::message::{MultiPart, SinglePart};
use tracing::{info, error, debug};

pub struct EmailService {
    smtp_host: String,
    smtp_port: u16,
    smtp_username: String,
    smtp_password: String,
    smtp_from: String,
    test_mode: bool,
}

impl EmailService {
    pub fn new(
        smtp_host: String,
        smtp_port: u16,
        smtp_username: String,
        smtp_password: String,
        smtp_from: String,
    ) -> Self {
        let test_mode = smtp_host.is_empty() || smtp_username.is_empty();
        
        if test_mode {
            info!("Email service running in test mode - emails will be logged only");
        }
        
        Self {
            smtp_host,
            smtp_port,
            smtp_username,
            smtp_password,
            smtp_from,
            test_mode,
        }
    }
    
    pub fn from_config(config: &crate::config::Config) -> Self {
        // Resend configuration
        Self::new(
            "smtp.resend.com".to_string(),
            587,
            "resend".to_string(),
            config.resend_api_key.clone().unwrap_or_default(),
            "EDT System <noreply@edt.local>".to_string(),
        )
    }
    
    pub async fn send_otp(&self, to_email: &str, otp_code: &str) -> Result<()> {
        let subject = "Your EDT Login Code";
        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
        .otp-code {{ background: #ffffff; border: 2px solid #4CAF50; color: #4CAF50; font-size: 32px; font-weight: bold; letter-spacing: 8px; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }}
        .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 14px; }}
        .warning {{ background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 4px; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Enterprise Digital Twin</h1>
            <p>Secure Login Verification</p>
        </div>
        <div class="content">
            <h2>Hello!</h2>
            <p>You requested a login code for EDT. Here's your one-time password:</p>
            <div class="otp-code">{}</div>
            <p>This code will expire in <strong>5 minutes</strong>.</p>
            <div class="warning">
                <strong>Security Notice:</strong> Never share this code with anyone. EDT staff will never ask for your login code.
            </div>
            <div class="footer">
                <p>If you didn't request this code, please ignore this email.</p>
                <p>&copy; 2025 Enterprise Digital Twin System</p>
            </div>
        </div>
    </div>
</body>
</html>"#,
            otp_code
        );
        
        let text_body = format!(
            "Your EDT Login Code\n\n\
             Your one-time password is: {}\n\n\
             This code will expire in 5 minutes.\n\n\
             If you didn't request this code, please ignore this email.\n\n\
             Enterprise Digital Twin System",
            otp_code
        );
        
        self.send_email(to_email, subject, &html_body, &text_body).await
    }
    
    pub async fn send_welcome(&self, to_email: &str, user_name: &str) -> Result<()> {
        let subject = "Welcome to EDT!";
        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: white; padding: 30px; text-align: center; border-radius: 8px; }}
        h1 {{ margin: 0; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to EDT, {}!</h1>
        </div>
        <p>Your account has been successfully created. You can now log in using your email address.</p>
    </div>
</body>
</html>"#,
            user_name
        );
        
        let text_body = format!(
            "Welcome to EDT, {}!\n\n\
             Your account has been successfully created. You can now log in using your email address.\n\n\
             Enterprise Digital Twin System",
            user_name
        );
        
        self.send_email(to_email, subject, &html_body, &text_body).await
    }
    
    pub async fn send_mfa_reset(&self, to_email: &str, reset_link: &str) -> Result<()> {
        let subject = "MFA Reset Request - EDT System";
        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #ff6b6b 0%, #feca57 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
        .reset-button {{ display: inline-block; padding: 15px 30px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
        .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 14px; }}
        .warning {{ background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 4px; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>MFA Reset Request</h1>
            <p>Enterprise Digital Twin System</p>
        </div>
        <div class="content">
            <h2>Reset Your Two-Factor Authentication</h2>
            <p>You requested to reset your two-factor authentication settings.</p>
            <p>Click the button below to reset your MFA and set it up again:</p>
            <div style="text-align: center;">
                <a href="{}" class="reset-button">Reset MFA Settings</a>
            </div>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <div class="warning">
                <strong>Security Notice:</strong> If you didn't request this reset, please ignore this email and your account will remain secure.
            </div>
            <div class="footer">
                <p>&copy; 2025 Enterprise Digital Twin System</p>
            </div>
        </div>
    </div>
</body>
</html>"#,
            reset_link
        );
        
        let text_body = format!(
            "MFA Reset Request - EDT System\n\n\
             You requested to reset your two-factor authentication.\n\n\
             Visit this link to reset your MFA settings:\n\
             {}\n\n\
             This link will expire in 1 hour.\n\n\
             If you didn't request this reset, please ignore this email.\n\n\
             Enterprise Digital Twin System",
            reset_link
        );
        
        self.send_email(to_email, subject, &html_body, &text_body).await
    }
    
    pub async fn send_account_deletion_confirmation(&self, to_email: &str, user_name: &str) -> Result<()> {
        let subject = "Account Deletion Confirmation - EDT";
        let html_body = format!(
            r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #8B0000 0%, #CD5C5C 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }}
        .confirmation-box {{ background: #ffffff; border: 2px solid #dc3545; color: #721c24; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0; }}
        .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 14px; }}
        .info-box {{ background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 15px; border-radius: 4px; margin-top: 20px; }}
        .warning {{ background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; padding: 15px; border-radius: 4px; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Account Deletion Confirmed</h1>
            <p>Enterprise Digital Twin System</p>
        </div>
        <div class="content">
            <h2>Hello {}!</h2>
            <div class="confirmation-box">
                <h3>✅ Your account has been successfully deleted</h3>
                <p><strong>Deletion completed on:</strong> {}</p>
            </div>
            
            <h3>What was removed:</h3>
            <ul>
                <li>Your user profile and authentication data</li>
                <li>All MFA (Two-Factor Authentication) settings</li>
                <li>Session history and activity logs</li>
                <li>All personal data associated with your account</li>
            </ul>
            
            <div class="info-box">
                <h4>Want to return?</h4>
                <p>If you decide to use EDT again in the future, you can register with the same email address. 
                You'll go through the complete setup process as if you were a new user, including setting up 
                Two-Factor Authentication again.</p>
            </div>
            
            <div class="warning">
                <strong>Important:</strong> This action was irreversible. If you didn't request this deletion 
                or have concerns, please contact our support team immediately.
            </div>
            
            <div class="footer">
                <p>Thank you for using the Enterprise Digital Twin System</p>
                <p>&copy; 2025 EDT System</p>
            </div>
        </div>
    </div>
</body>
</html>"#,
            user_name,
            chrono::Utc::now().format("%B %d, %Y at %H:%M UTC")
        );
        
        let text_body = format!(
            "Account Deletion Confirmation - EDT\n\n\
             Hello {}!\n\n\
             ✅ Your account has been successfully deleted\n\
             Deletion completed on: {}\n\n\
             What was removed:\n\
             • Your user profile and authentication data\n\
             • All MFA (Two-Factor Authentication) settings\n\
             • Session history and activity logs\n\
             • All personal data associated with your account\n\n\
             Want to return?\n\
             If you decide to use EDT again in the future, you can register with the same \
             email address. You'll go through the complete setup process as if you were a \
             new user, including setting up Two-Factor Authentication again.\n\n\
             IMPORTANT: This action was irreversible. If you didn't request this deletion \
             or have concerns, please contact our support team immediately.\n\n\
             Thank you for using the Enterprise Digital Twin System\n\
             © 2025 EDT System",
            user_name,
            chrono::Utc::now().format("%B %d, %Y at %H:%M UTC")
        );
        
        self.send_email(to_email, subject, &html_body, &text_body).await
    }
    
    async fn send_email(&self, to: &str, subject: &str, html_body: &str, text_body: &str) -> Result<()> {
        if self.test_mode {
            info!("📧 TEST MODE - Email would be sent:");
            info!("  To: {}", to);
            info!("  From: {}", self.smtp_from);
            info!("  Subject: {}", subject);
            info!("  Body preview: {}...", text_body.chars().take(100).collect::<String>());
            return Ok(());
        }
        
        info!("📧 Attempting to send email to {} via Resend", to);
        debug!("Sending email to {}", to);
        
        let email = Message::builder()
            .from(self.smtp_from.parse()?)
            .to(to.parse()?)
            .subject(subject)
            .multipart(
                MultiPart::alternative()
                    .singlepart(
                        SinglePart::plain(text_body.to_string())
                    )
                    .singlepart(
                        SinglePart::html(html_body.to_string())
                    )
            )?;
        
        let creds = Credentials::new(
            self.smtp_username.clone(),
            self.smtp_password.clone(),
        );
        
        let mailer = AsyncSmtpTransport::<lettre::Tokio1Executor>::starttls_relay(&self.smtp_host)?
            .credentials(creds)
            .port(self.smtp_port)
            .build();
        
        match mailer.send(email).await {
            Ok(_) => {
                info!("✅ Email sent successfully to {}", to);
                Ok(())
            }
            Err(e) => {
                error!("❌ Failed to send email to {}: {}", to, e);
                Err(anyhow::anyhow!("Failed to send email: {}", e))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_email_service_test_mode() {
        let service = EmailService::new(
            String::new(),
            587,
            String::new(),
            String::new(),
            "test@edt.local".to_string(),
        );
        
        assert!(service.test_mode);
        
        // Should not error in test mode
        assert!(service.send_otp("user@example.com", "123456").await.is_ok());
        assert!(service.send_welcome("user@example.com", "Test User").await.is_ok());
    }
}