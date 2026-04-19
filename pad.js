const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'app/(consumer)');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
    if (file === 'profile.tsx' || file === 'edit-profile.tsx' || file === 'settings.tsx' || file === 'home.tsx') continue; // already modified or uses ScreenScaffold without need

    const fullPath = path.join(dir, file);
    let content = fs.readFileSync(fullPath, 'utf8');

    // Quick regex to find contentContainerStyle inside ScrollView or FlatList that may need paddingTop
    // We want to add paddingTop: Platform.OS === 'web' ? 80 : insets.top + xx
    
    // Check if file uses ScreenScaffold
    if (content.includes('<ScreenScaffold')) {
        // If it includes ScreenScaffold, the scaffold handles padding, BUT wait.
        // Some files pass styling explicitly to FlatList even with ScreenScaffold (like marketplace.tsx and collection.tsx)
        // If so, they usually already have paddingTop.
        continue;
    }

    if (content.includes('paddingTop: Platform.OS === \'web\'')) {
        continue;
    }

    let modified = false;

    // We look for typical padding declarations to inject ours.
    // Replace paddingHorizontal: isDesktopLayout ? 32 : 16,
    // with paddingHorizontal: ..., paddingTop: Platform.OS === 'web' ? 80 : undefined,
    // (Only if it doesn't already have paddingTop right after or before)
    
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('paddingHorizontal') && lines[i].includes('isDesktopLayout')) {
            // Check surrounding lines for paddingTop
            let hasPaddingTop = false;
            for(let j = Math.max(0, i-3); j < Math.min(lines.length, i+4); j++) {
                if (lines[j].includes('paddingTop')) {
                    hasPaddingTop = true;
                    // Fix existing paddingTop if it doesn't account for web
                    if (!lines[j].includes('Platform.OS') && lines[j].includes('isDesktopLayout ? 24 : insets.top')) {
                        lines[j] = lines[j].replace('isDesktopLayout ? 24', 'Platform.OS === \'web\' ? 80');
                        modified = true;
                    } else if (!lines[j].includes('Platform.OS') && lines[j].includes('insets.top')) {
                       // Probably mobile specific, we can prepend `Platform.OS === 'web' ? 80 : `
                       // But let's be careful.
                    }
                }
            }
            if (!hasPaddingTop) {
                // Insert it after this line
                lines.splice(i+1, 0, `                        paddingTop: Platform.OS === 'web' ? 80 : undefined,`);
                modified = true;
                break;
            }
        }
    }
    
    if (modified) {
        fs.writeFileSync(fullPath, lines.join('\n'));
        console.log('Modified', file);
    }
}
