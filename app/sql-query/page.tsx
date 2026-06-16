import { redirect } from "next/navigation";

// SQL Query is a tab inside the main console (app/page.tsx), not a standalone page.
// This route only exists for deep links / bookmarks: it redirects into the console
// with the SQL Query tab pre-selected.
export default function SqlQueryRedirect() {
  redirect("/?tab=sql-query");
}
