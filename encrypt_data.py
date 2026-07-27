import json
import base64
import os
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PASSWORD = b"LetsMakeS0meGreatCake"
SALT = b"Zybenko Mihail Petrovich"

def encrypt_file():
    print("Deriving key...")
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=SALT,
        iterations=100000,
    )
    key = kdf.derive(PASSWORD)
    aesgcm = AESGCM(key)

    print("Reading recipes_data.js...")
    with open('recipes_data.js', 'r', encoding='utf-8') as f:
        content = f.read().strip()

    # The file starts with window.RECIPES = 
    prefix = "window.RECIPES = "
    if content.startswith(prefix):
        json_str = content[len(prefix):]
    else:
        # Fallback
        start_idx = content.find('[')
        json_str = content[start_idx:]
        
    if json_str.endswith(';'):
        json_str = json_str[:-1]

    data_bytes = json_str.encode('utf-8')

    # Generate 12 byte IV
    iv = os.urandom(12)
    
    print("Encrypting data...")
    # AES-GCM encryption
    ciphertext = aesgcm.encrypt(iv, data_bytes, None)

    # Combine IV and ciphertext for easier storage
    encoded = base64.b64encode(iv + ciphertext).decode('utf-8')

    output_js = f"window.ENCRYPTED_RECIPES = '{encoded}';"

    with open('recipes_encrypted.js', 'w', encoding='utf-8') as f:
        f.write(output_js)

    print("Saved to recipes_encrypted.js")

if __name__ == "__main__":
    encrypt_file()
