"""
ChatGPT Profile Switcher - Windows System Tray Application
"""
import os
import sys
import json
import subprocess
import winreg
from pathlib import Path
from PIL import Image, ImageDraw
import pystray
from pystray import MenuItem


def find_chrome():
    """Locate Chrome executable."""
    try:
        key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, 
                             r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe")
        chrome_path, _ = winreg.QueryValueEx(key, "")
        winreg.CloseKey(key)
        if os.path.exists(chrome_path):
            return chrome_path
    except WindowsError:
        pass
    
    candidates = [
        Path(os.environ.get("ProgramFiles", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("ProgramFiles(x86)", "")) / "Google/Chrome/Application/chrome.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe",
    ]
    
    for path in candidates:
        if path.exists():
            return str(path)
    
    return None


def get_chrome_profiles():
    """Get Chrome profiles from Local State file."""
    user_data = Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/User Data"
    local_state_file = user_data / "Local State"
    
    profiles = {}
    
    if local_state_file.exists():
        try:
            with open(local_state_file, 'r', encoding='utf-8') as f:
                local_state = json.load(f)
                profile_cache = local_state.get('profile', {}).get('info_cache', {})
                
                for directory, info in profile_cache.items():
                    name = info.get('name', directory)
                    # Key is display name, value is ACTUAL directory
                    display = f"{name} ({directory})" if directory != "Default" else name
                    profiles[display] = directory
                    print(f"Profile: {display} => {directory}")
        except Exception as e:
            print(f"Error reading Local State: {e}")
    
    return profiles


def launch_chrome(chrome_path, profile_dir, url):
    """Launch Chrome with profile."""
    print(f"\n>>> LAUNCH CALLED <<<")
    print(f">>> Profile dir: {profile_dir}")
    print(f">>> Type: {type(profile_dir)}")
    print(f">>> Repr: {repr(profile_dir)}")
    
    cmd = [chrome_path, f"--profile-directory={profile_dir}", url]
    print(f">>> Command: {cmd}\n")
    
    subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def create_icon():
    """Create tray icon."""
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse((4, 4, 60, 60), fill="#10a37f", outline="#0d9472", width=2)
    draw.arc((16, 16, 48, 48), start=45, end=315, fill="white", width=6)
    return img


def main():
    """Main entry point."""
    CHATGPT_URL = "https://chat.openai.com/"
    
    chrome_path = find_chrome()
    if not chrome_path:
        print("Chrome not found!")
        sys.exit(1)
    
    print(f"Chrome: {chrome_path}\n")
    
    profiles = get_chrome_profiles()
    
    if not profiles:
        print("No profiles found!")
        sys.exit(1)
    
    print(f"\nTotal: {len(profiles)} profiles\n")
    
    # Build menu with explicit closures
    menu_items = []
    
    for display_name, directory in profiles.items():
        # This is the FIX - bind directory in the function definition
        def make_action(dir_name):
            def action(icon, item):
                print(f"\n!!! CLICKED: {item.text} !!!")
                print(f"!!! Will use: {dir_name} !!!\n")
                launch_chrome(chrome_path, dir_name, CHATGPT_URL)
            return action
        
        menu_items.append(MenuItem(display_name, make_action(directory)))
        print(f"Created menu for: {display_name} -> {directory}")
    
    menu_items.append(MenuItem("Exit", lambda icon, item: icon.stop()))
    
    icon = pystray.Icon(
        "ChatGPT Switcher",
        icon=create_icon(),
        title="ChatGPT Profile Switcher",
        menu=pystray.Menu(*menu_items)
    )
    
    print("\n=== Tray app started ===\n")
    icon.run()


if __name__ == "__main__":
    main()