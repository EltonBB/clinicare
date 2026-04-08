"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/utils/supabase/client";

function isMobileDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(
    navigator.userAgent
  );
}

export function AuthConfirmationBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const hasHandled = useRef(false);

  useEffect(() => {
    if (hasHandled.current || typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    const code = url.searchParams.get("code");
    const queryType = url.searchParams.get("type");
    const hashType = hashParams.get("type");
    const callbackType = queryType || hashType;
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const errorDescription =
      url.searchParams.get("error_description") ||
      url.searchParams.get("error") ||
      hashParams.get("error_description") ||
      hashParams.get("error");

    if (!code && !(accessToken && refreshToken) && !errorDescription) {
      return;
    }

    hasHandled.current = true;

    const supabase = createClient();

    async function handleCallback() {
      if (errorDescription) {
        router.replace(
          `/confirm-email?error=${encodeURIComponent(
            "That verification link is no longer valid. Request a new one below."
          )}`
        );
        return;
      }

      let authError: string | null = null;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        authError = error?.message ?? null;
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        authError = error?.message ?? null;
      }

      if (authError) {
        router.replace(
          `/confirm-email?error=${encodeURIComponent(
            "That verification link is no longer valid. Request a new one below."
          )}`
        );
        return;
      }

      if (callbackType === "recovery") {
        router.replace("/reset-password?recovery=1");
        return;
      }

      if (callbackType === "signup" || callbackType === "email" || pathname === "/confirm-email") {
        await supabase.auth.signOut();

        if (isMobileDevice()) {
          router.replace("/confirm-email?verified=1");
        } else {
          router.replace("/login?verified=1");
        }
      }
    }

    void handleCallback();
  }, [pathname, router]);

  return null;
}
