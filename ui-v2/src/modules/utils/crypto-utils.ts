import CryptoJS from "crypto-js";
const SECRET = "registry-temp-sec-2468";

export function encrypt(data: string): string {
  return CryptoJS.AES.encrypt(data, SECRET).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, SECRET);
  return bytes.toString(CryptoJS.enc.Utf8);
}
