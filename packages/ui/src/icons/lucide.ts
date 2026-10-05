/** Thin re-export so apps/packages/features never import @tamagui/lucide-icons-2. */
export { Eye, EyeOff, Github, Info, Mail, Pencil } from '@tamagui/lucide-icons-2';
// Aliased: bare `Menu` is the lucide hamburger. Tamagui Menu / create-menu
// are unused leftovers and are not house barrel names. Package
// root re-exports this as `Menu` after the curated tamagui surface.
export { Menu as MenuIcon } from '@tamagui/lucide-icons-2';
