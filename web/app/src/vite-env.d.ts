/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXTENSION_ID_CHROMIUM?: string;
  readonly VITE_ANDROID_APP_URL?: string;
  readonly VITE_EXTENSION_CHROME_URL?: string;
  readonly VITE_EXTENSION_FIREFOX_URL?: string;
  readonly VITE_EXTENSION_MANIFEST_URL?: string;
  readonly VITE_PARTY_SERVER_URL?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts from web/extension/dev-key/extension-id.txt. */
declare const DEV_EXTENSION_ID: string;

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (options: {
          client_id: string;
          callback: (response: { credential?: string; select_by?: string }) => void;
          auto_select?: boolean;
          cancel_on_tap_outside?: boolean;
          context?: string;
          ux_mode?: 'popup' | 'redirect';
        }) => void;
        renderButton: (
          parent: HTMLElement,
          options: {
            type?: 'standard' | 'icon';
            theme?: 'outline' | 'filled_blue' | 'filled_black';
            size?: 'large' | 'medium' | 'small';
            text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
            shape?: 'rectangular' | 'pill' | 'circle' | 'square';
            logo_alignment?: 'left' | 'center';
            width?: number | string;
            locale?: string;
          }
        ) => void;
        prompt: (momentListener?: (notification: any) => void) => void;
        cancel: () => void;
        disableAutoSelect: () => void;
      };
      oauth2?: {
        initTokenClient: (config: any) => any;
        initCodeClient: (config: any) => any;
      };
    };
  };
}
