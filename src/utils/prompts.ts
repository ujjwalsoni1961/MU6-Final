/**
 * Cross-platform alert / confirm helpers.
 *
 * Why this file exists:
 *   `react-native`'s `Alert.alert` is polyfilled by `react-native-web` to a
 *   plain `window.alert()` — which completely drops the `buttons[]` array.
 *   As a result, any `onPress` callback attached to a button NEVER fires on
 *   web. That silently broke the collection screen's "Cancel Listing" flow
 *   (tap → nothing happens) because all the work was inside the confirm
 *   button's `onPress`.
 *
 * Usage:
 *   const ok = await confirmPrompt('Cancel Listing', 'Are you sure?', {
 *     confirmLabel: 'Cancel Listing',
 *     cancelLabel: 'Keep Listed',
 *     destructive: true,
 *   });
 *   if (!ok) return;
 *   // …do the thing
 *
 *   notify('Cancelled', 'Your NFT listing has been cancelled.');
 */
import { Alert, Platform } from 'react-native';

export interface ConfirmOptions {
    confirmLabel?: string;
    cancelLabel?: string;
    /** Marks the confirm button as destructive on iOS (red). Web ignores this. */
    destructive?: boolean;
}

/**
 * Show a yes/no confirmation dialog. Resolves to true if the user confirms,
 * false if they cancel or dismiss. Works on web, iOS, and Android.
 */
export function confirmPrompt(
    title: string,
    message: string,
    options: ConfirmOptions = {},
): Promise<boolean> {
    const confirmLabel = options.confirmLabel ?? 'Confirm';
    const cancelLabel = options.cancelLabel ?? 'Cancel';

    if (Platform.OS === 'web') {
        // window.confirm shows only one button label, so we prefix the
        // confirm label into the body to preserve the intent ("OK" = confirm).
        // It's a native browser dialog, so it always renders correctly
        // and returns a synchronous boolean.
        const body = `${message}\n\nPress OK to ${confirmLabel.toLowerCase()}, or Cancel to ${cancelLabel.toLowerCase()}.`;
        // eslint-disable-next-line no-alert
        const ok = typeof window !== 'undefined' && window.confirm
            ? window.confirm(`${title}\n\n${body}`)
            : false;
        return Promise.resolve(ok);
    }

    return new Promise((resolve) => {
        Alert.alert(
            title,
            message,
            [
                {
                    text: cancelLabel,
                    style: 'cancel',
                    onPress: () => resolve(false),
                },
                {
                    text: confirmLabel,
                    style: options.destructive ? 'destructive' : 'default',
                    onPress: () => resolve(true),
                },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
        );
    });
}

/**
 * Show a single-button informational dialog. Resolves when dismissed.
 * Uses `window.alert` on web (which blocks until dismissed) and
 * `Alert.alert` on native.
 */
export function notify(title: string, message: string): Promise<void> {
    if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        if (typeof window !== 'undefined' && window.alert) {
            window.alert(`${title}\n\n${message}`);
        }
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        Alert.alert(title, message, [
            { text: 'OK', onPress: () => resolve() },
        ]);
    });
}
