import CryptoJS from "crypto-js";

// This is only used to lightly obfuscate data stored in sessionStorage.
// It is not meant to be treated as a real secret-management mechanism.
const CLIENT_STORAGE_SECRET = "registry-temp-sec-2468";

export function encrypt(data: string): string {
  return CryptoJS.AES.encrypt(data, CLIENT_STORAGE_SECRET).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, CLIENT_STORAGE_SECRET);
  return bytes.toString(CryptoJS.enc.Utf8);
}
