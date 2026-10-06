# Consuming Atelier in Expo apps

> **Expo / React Native support is not yet available in this package.**
>
> This design system is a web-only artifact. It exports CSS variables
> (`./styles.css`) and DOM-based React components (`./components/*`) that
> cannot run in a React Native / Expo environment. Attempting to import them
> from an Expo app will result in unresolved module errors.
>
> The portable token object (`./tokens`) **is** safe to import in any
> JavaScript environment, including Expo, and can be used to drive a native
> theme manually:
>
> ```tsx
> import { tokens } from "@cognirise/atelier/tokens";
>
> // Convert CSS rem to device-independent pixels (1rem = 16px)
> const radiusPx =
>   Number.parseFloat(tokens.radius) * 16;
>
> // Use color values directly:
> const primaryColor = tokens.color.dark.primary; // "#C45BB8"
> ```

## Typography

Brand fonts: **Comfortaa** for all headings, display text, and the brand
wordmark (weights 400 and 700 only — never a synthesized 600); **Inter** for
body copy, UI labels, buttons, stats, and captions (weights 400, 600, 800).
Unlike web, React Native does not load fonts from CSS — the consuming Expo app
must load them itself via `expo-font` and the `@expo-google-fonts` packages:

```bash
pnpm add @expo-google-fonts/comfortaa @expo-google-fonts/inter expo-font
```

```tsx
import {
  Comfortaa_400Regular,
  Comfortaa_700Bold,
} from "@expo-google-fonts/comfortaa";
import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_800ExtraBold,
  useFonts,
} from "@expo-google-fonts/inter";

const [fontsLoaded, fontError] = useFonts({
  Comfortaa_400Regular,
  Comfortaa_700Bold,
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_800ExtraBold,
});
```

Load these once in the root layout and hold the splash screen until
`fontsLoaded || fontError`. Reference the fonts by their loaded names in
styles (`fontFamily: "Comfortaa_700Bold"` for headings/wordmark,
`fontFamily: "Inter_400Regular"` etc. for body/UI).

Usage rules (mirroring the web guidance):

- Headings, display text, and the wordmark use Comfortaa only, at weight 400
  or 700. Comfortaa ships no other weights here — **never synthesize a 600**
  (React Native will fake-bold if you pair `Comfortaa_400Regular` with
  `fontWeight: "600"`; don't).
- Comfortaa has **no italic**. Do not apply `fontStyle: "italic"` to it;
  italic accents are an Inter-only affordance.
- Body copy, UI labels, buttons, stats, and captions use Inter (400/600/800).
  Do not use Comfortaa for body copy.
- Set `fontWeight` implicitly by choosing the loaded font name (e.g.
  `Inter_600SemiBold`), not via the `fontWeight` style property, to avoid
  faux-bolding on Android.

## App shell & chat

The app-shell and chat conventions (chat area pinned to screen height with an
internally scrolling transcript and bottom-fixed composer; composer anatomy —
36px circular "+" attach button, 22px-radius input pill, 32px circular accent
send button; lens selection via a drop-down in the title bar; and a
light/dark/system theme mode selector in the title bar) are defined in
`docs/consuming-web.md` under **App shell & chat**. Mirror the same anatomy,
proportions, and behaviors natively (e.g. `KeyboardAvoidingView` + a
`FlatList` transcript with the composer outside it, a native menu for the
lens picker, and `Appearance`/`useColorScheme` for the System theme mode).

## Honest scope

What an Expo app gets today: the token object (now including the whole brand
layer — gradient stops, status hues, backdrop stops and the hero island as
plain hex), the typography rules above, and the layout and chat conventions to
mirror natively.

What does not exist: `src/components/native/`. There is no native Button,
Card, Badge, title bar, page hero or chat rail. An Expo app builds those
itself from the tokens, matching the web components' public API family by
family, and documents any platform-required difference in `docs/AGENTS.md`
under "What's here".

Do not claim an Expo app is "on the design system" because it imports the
tokens. It is on the palette and the type rules; the components and the layout
are still hand-built until a native layer exists.

```tsx
import { tokens } from "@cognirise/atelier/tokens";

const c = tokens.color.dark;
const gradient = tokens.brand.gradient;        // four hex stops, left to right
const hero = tokens.brand.hero;                // the dark island surface
const backdrop = tokens.brand.backdrop.dark;   // deep / mid / hi stops
```
