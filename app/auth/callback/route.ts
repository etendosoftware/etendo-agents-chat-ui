import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = createClient();
  const url = new URL(request.url);

  // 1. Exchange the auth code for a Supabase session
  const { data: { session }, error: sessionError } =
    await supabase.auth.exchangeCodeForSession(url.searchParams.get("code") || "");

  if (sessionError || !session?.user) {
    console.error("OAuth callback error:", sessionError?.message);
    return NextResponse.redirect(new URL("/auth/login?error=oauth_failed", request.url));
  }

  const user = session.user;

  // 2. Default role
  let role = "non_client";

  // 3. Call Jira webhook to check if the user exists
  try {
    const jiraWebhookUrl = process.env.JIRA_WEBHOOK_URL;
    if (jiraWebhookUrl) {
      const jiraResponse = await fetch(jiraWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });

      if (jiraResponse.ok) {
        const jiraData = await jiraResponse.json();
        if (jiraData.isJiraUser) {
          role = "partner";
        }
      } else {
        console.error("Jira webhook failed:", jiraResponse.statusText);
      }
    } else {
      console.warn("JIRA_WEBHOOK_URL not configured");
    }
  } catch (err) {
    console.error("Error checking Jira:", err);
  }

  // 4. Get current profile role
  try {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError.message);
    } else if (profile?.role !== "admin") {
      // 5. Update the user profile role only if not admin
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating role:", updateError.message);
      }
    } else {
      console.log("Profile role is admin — skipping update");
    }
  } catch (err) {
    console.error("Unexpected DB error:", err);
  }

  // 6. Redirect user to dashboard (or wherever you want)
  return NextResponse.redirect(new URL("/", request.url));
}
