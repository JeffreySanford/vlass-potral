import os
import re

replacements = {
    'vlass-api': 'cosmic-horizons-api',
    'vlass-web': 'cosmic-horizons-web',
    'vlass-portal': 'cosmic-horizons',
    'vlass_portal': 'cosmic_horizons',
    'vlass_user': 'cosmic_horizons_user',
    'vlass_password': 'cosmic_horizons_password',
    'vlass_redis': 'cosmic_horizons_redis',
    'VLASS_API': 'COSMIC_HORIZONS_API',
    'cosmic-horizon': 'cosmic-horizons',
    'cosmic_horizon': 'cosmic_horizons',
}

def replace_in_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        # Skip binary files
        return

    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)

    if new_content != content:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated: {file_path}")

def main():
    exclude_dirs = {'.git', 'node_modules', '.next', 'dist', 'out-tsc', '.angular'}
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in exclude_dirs]
        for file in files:
            file_path = os.path.join(root, file)
            # Skip the script itself
            if file == 'rebrand.py':
                continue
            replace_in_file(file_path)

if __name__ == "__main__":
    main()
