// Encryption utilities for sensitive data storage
import crypto from 'crypto';

const algorithm = 'aes-256-gcm';

// Get encryption key from environment
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  if (key.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters). Generate with: openssl rand -hex 32');
  }

  return Buffer.from(key, 'hex');
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  authTag: string;
}

/**
 * Encrypts a string using AES-256-GCM
 * @param text - Plain text to encrypt
 * @returns Object containing encrypted data, IV, and auth tag
 */
export function encryptData(text: string): EncryptedData {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, getEncryptionKey(), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts data encrypted with encryptData
 * @param encryptedData - Object containing encrypted string, IV, and auth tag
 * @returns Decrypted plain text
 */
export function decryptData(encryptedData: EncryptedData): string {
  try {
    const decipher = crypto.createDecipheriv(
      algorithm,
      getEncryptionKey(),
      Buffer.from(encryptedData.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Encrypts Convoso credentials for secure storage
 */
export function encryptConvosoCredentials(apiKey: string, authToken: string, apiBase?: string) {
  return {
    api_key: encryptData(apiKey),
    auth_token: encryptData(authToken),
    api_base: apiBase || 'https://api.convoso.com/v1'
  };
}

/**
 * Decrypts Convoso credentials from storage
 */
export function decryptConvosoCredentials(encrypted: any) {
  return {
    api_key: decryptData(encrypted.api_key),
    auth_token: decryptData(encrypted.auth_token),
    api_base: encrypted.api_base || 'https://api.convoso.com/v1'
  };
}