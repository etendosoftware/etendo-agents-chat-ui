'use server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

export async function signUpWithJiraCheck(values: unknown) {
  const formSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  });

  const parsed = formSchema.safeParse(values);
  if (!parsed.success) {
    return { error: 'Invalid form data.' };
  }

  const { email, password } = parsed.data;
  const supabase = createClient();

  // Variable to store the user role
  let userRole = 'non_client'; // Default role for non-Jira users

  // 1. Jira Webhook Check
  try {
    const jiraWebhookUrl = process.env.JIRA_WEBHOOK_URL;
    if (!jiraWebhookUrl) {
      console.error('JIRA_WEBHOOK_URL is not set.');
      return { error: 'Server configuration error. Please contact support.' };
    }

    const jiraResponse = await fetch(jiraWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!jiraResponse.ok) {
      console.error('Jira webhook returned an error:', jiraResponse.statusText);
      return { error: 'Could not verify organization status. Please try again later.' };
    }

    const jiraData = await jiraResponse.json();
    
    if (jiraData.isJiraUser) {
      userRole = 'partner';
    }
  } catch (e) {
    console.error('Error calling Jira webhook:', e);
    // seguimos con non_client si falla
  }

  // 2. Sign up user in Supabase
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (signUpError) {
    return { error: `Failed to sign up: ${signUpError.message}` };
  }

  if (!signUpData.user) {
    return { error: 'User was not created. Please try again.' };
  }

  // 3. Update (or create) profile with correct role
  try {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: signUpData.user.id, // el mismo id que el user
        role: userRole,
      });

    if (profileError) {
      console.error('Failed to update profile role:', profileError.message);
    }
  } catch (err) {
    console.error('Unexpected error updating profile role:', err);
  }

  return { success: true };
}
