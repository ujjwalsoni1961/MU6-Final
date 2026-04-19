import os

dir_path = "app/(consumer)"
files = [f for f in os.listdir(dir_path) if f.endswith(".tsx")]

swaps = 0
for f in files:
    if f in ['profile.tsx', 'edit-profile.tsx', 'settings.tsx', 'home.tsx']:
        continue
        
    full_path = os.path.join(dir_path, f)
    with open(full_path, "r") as fp:
        lines = fp.readlines()
        
    content = "".join(lines)
    if "<ScreenScaffold" in content:
        continue
    if "paddingTop: Platform.OS === 'web'" in content:
        continue
        
    modified = False
    for i, line in enumerate(lines):
        if "paddingHorizontal" in line and "isDesktopLayout" in line:
            # check surroundings for paddingTop
            has_padding_top = False
            for j in range(max(0, i-3), min(len(lines), i+4)):
                if "paddingTop" in lines[j]:
                    has_padding_top = True
                    if "Platform.OS" not in lines[j] and "isDesktopLayout ? 24 : insets.top" in lines[j]:
                        lines[j] = lines[j].replace("isDesktopLayout ? 24", "Platform.OS === 'web' ? 80")
                        modified = True
            
            if not has_padding_top:
                # Add paddingTop
                lines.insert(i+1, "                        paddingTop: Platform.OS === 'web' ? 80 : undefined,\n")
                modified = True
                break
                
    if modified:
        with open(full_path, "w") as fp:
            fp.writelines(lines)
        print("Modified", f)
        swaps += 1

print(f"Total modified: {swaps}")
