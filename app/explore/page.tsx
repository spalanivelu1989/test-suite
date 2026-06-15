import { redirect } from "next/navigation";

// Pattern Explorer is a tab inside the main console (app/page.tsx), not a
// standalone page — navigating to it is in-app state, so the sidebar never
// remounts/flashes. This route only exists for deep links / bookmarks: it
// redirects into the console with the Explore tab pre-selected.
export default function ExploreRedirect() {
  redirect("/?tab=explore");
}
