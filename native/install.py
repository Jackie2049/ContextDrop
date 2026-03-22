#!/usr/bin/env python3
"""
ContextDrop Native Host Installer

This script installs the Native Messaging Host configuration for Chrome.
Run this script once to enable the extension to communicate with the local server.

Usage:
    python install.py [--extension-id=YOUR_EXTENSION_ID]

On Linux, the manifest will be installed to:
    ~/.config/google-chrome/NativeMessagingHosts/com.contextdrop.host.json
    or
    ~/.config/chromium/NativeMessagingHosts/com.contextdrop.host.json

On macOS:
    ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.contextdrop.host.json

On Windows, you need to add a registry key:
    HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.contextdrop.host
"""

import os
import sys
import json
import argparse
from pathlib import Path


def get_native_host_path() -> Path:
    """Get the absolute path to the native host script."""
    script_dir = Path(__file__).parent.resolve()
    return script_dir / "native_host.py"


def get_chrome_manifest_paths() -> list:
    """Get possible Chrome manifest installation paths based on OS."""
    home = Path.home()

    if sys.platform == 'linux':
        return [
            home / ".config/google-chrome/NativeMessagingHosts/com.contextdrop.host.json",
            home / ".config/chromium/NativeMessagingHosts/com.contextdrop.host.json",
        ]
    elif sys.platform == 'darwin':
        return [
            home / "Library/Application Support/Google/Chrome/NativeMessagingHosts/com.contextdrop.host.json",
        ]
    elif sys.platform == 'win32':
        # Windows requires registry, return None to indicate special handling
        return None
    else:
        return []


def create_manifest(extension_id: str) -> dict:
    """Create the Native Messaging Host manifest."""
    native_host_path = get_native_host_path()

    manifest = {
        "name": "com.contextdrop.host",
        "description": "ContextDrop Native Host - Local memory storage service connector",
        "path": str(native_host_path),
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{extension_id}/"
        ]
    }

    return manifest


def install_linux_macos(extension_id: str) -> bool:
    """Install manifest for Linux/macOS."""
    manifest = create_manifest(extension_id)
    paths = get_chrome_manifest_paths()

    if not paths:
        print("Unsupported platform for automatic installation")
        return False

    installed = False
    for path in paths:
        try:
            # Create directory if it doesn't exist
            path.parent.mkdir(parents=True, exist_ok=True)

            # Write manifest
            with open(path, 'w') as f:
                json.dump(manifest, f, indent=2)

            print(f"Installed manifest to: {path}")
            installed = True

        except PermissionError:
            print(f"Permission denied for: {path}")
        except Exception as e:
            print(f"Failed to install to {path}: {e}")

    return installed


def print_windows_instructions(extension_id: str):
    """Print installation instructions for Windows."""
    manifest = create_manifest(extension_id)
    native_host_path = get_native_host_path()

    # Create a temporary manifest file for the user to use
    temp_manifest_path = Path(__file__).parent / "com.contextdrop.host.json"

    with open(temp_manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print("\n" + "=" * 60)
    print("WINDOWS INSTALLATION INSTRUCTIONS")
    print("=" * 60)
    print(f"\n1. A manifest file has been created at:")
    print(f"   {temp_manifest_path}")
    print("\n2. Open Registry Editor (regedit)")
    print("\n3. Navigate to or create the key:")
    print("   HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.contextdrop.host")
    print("\n4. Set the default value of this key to the manifest file path:")
    print(f"   {temp_manifest_path}")
    print("\n5. Restart Chrome")
    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Install ContextDrop Native Messaging Host"
    )
    parser.add_argument(
        '--extension-id',
        required=True,
        help='Chrome extension ID (e.g., abcdefghijklmnopqrstuvwxyz123456)'
    )

    args = parser.parse_args()

    print(f"Installing ContextDrop Native Host for extension: {args.extension_id}")
    print(f"Native host script: {get_native_host_path()}")
    print()

    if sys.platform == 'win32':
        print_windows_instructions(args.extension_id)
    else:
        if install_linux_macos(args.extension_id):
            print("\nInstallation successful!")
            print("Please restart Chrome to apply changes.")
        else:
            print("\nInstallation failed.")
            sys.exit(1)


if __name__ == '__main__':
    main()
