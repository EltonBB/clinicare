"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { buildAuthRedirectUrl } from "@/lib/app-url";
import { createEmailVerificationReceipt } from "@/lib/email-verification-receipts";
import { createClient } from "@/utils/supabase/server";

type FormValues = {
  email?: string;
  password?: string;
  next?: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

type OwnerProfileValues = {
  fullName?: string;
  email?: string;
  phone?: string;
  newPassword?: string;
  confirmPassword?: string;
};

type OwnerProfileFieldErrors = Partial<Record<keyof OwnerProfileValues, string>>;

type PasswordResetValues = {
  email?: string;
  password?: string;
  confirmPassword?: string;
};

type PasswordResetFieldErrors = Partial<Record<keyof PasswordResetValues, string>>;

export type AuthActionState = {
  error?: string;
  success?: string;
  fieldErrors?: FieldErrors;
  values?: FormValues;
};

export type OwnerProfileActionState = {
  error?: string;
  success?: string;
  fieldErrors?: OwnerProfileFieldErrors;
  values?: OwnerProfileValues;
};

export type PasswordResetActionState = {
  error?: string;
  success?: string;
  fieldErrors?: PasswordResetFieldErrors;
  values?: PasswordResetValues;
};

const signUpSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Enter your password."),
  next: z.string().optional(),
});

const resendSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

const ownerProfileSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your name."),
    email: z.string().trim().email("Enter a valid email address."),
    phone: z.string().trim().optional(),
    newPassword: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const newPassword = value.newPassword?.trim() ?? "";
    const confirmPassword = value.confirmPassword?.trim() ?? "";

    if (newPassword.length > 0 && newPassword.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "Password must be at least 8 characters.",
      });
    }

    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

function sanitizeNextPath(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/dashboard";
  }

  return next;
}

export async function signUpAction(
  _: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const values = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };

  const parsed = signUpSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof FormValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const verificationTicket = crypto.randomUUID();
  const emailRedirectTo = await buildAuthRedirectUrl(
    `/login?ticket=${verificationTicket}`
  );

  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    return {
      error: error.message,
      values,
    };
  }

  await createEmailVerificationReceipt(verificationTicket, parsed.data.email);

  redirect(
    `/confirm-email?email=${encodeURIComponent(parsed.data.email)}&sent=1&ticket=${verificationTicket}`
  );
}

export async function loginAction(
  _: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const values = {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    next: String(formData.get("next") ?? ""),
  };

  const parsed = loginSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: FieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof FormValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Enter a valid email and password.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: "We couldn't log you in with those credentials.",
      values,
    };
  }

  if (!data.user.email_confirmed_at) {
    redirect(
      `/confirm-email?email=${encodeURIComponent(parsed.data.email)}&pending=1`
    );
  }

  redirect(sanitizeNextPath(parsed.data.next));
}

export async function resendConfirmationAction(
  _: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const values = {
    email: String(formData.get("email") ?? "").trim(),
    ticket: String(formData.get("ticket") ?? "").trim(),
  };

  const parsed = resendSchema.safeParse(values);

  if (!parsed.success) {
    return {
      error: "Enter a valid email address to resend the verification email.",
      values,
    };
  }

  const supabase = await createClient();
  const verificationTicket = values.ticket || crypto.randomUUID();
  const emailRedirectTo = await buildAuthRedirectUrl(
    `/login?ticket=${verificationTicket}`
  );

  await createEmailVerificationReceipt(verificationTicket, parsed.data.email);

  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data.email,
    options: {
      emailRedirectTo,
    },
  });

  if (error) {
    return {
      error: error.message,
      values,
    };
  }

  return {
    success: `A fresh verification email was sent to ${parsed.data.email}.`,
    values,
  };
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(
  _: PasswordResetActionState,
  formData: FormData
): Promise<PasswordResetActionState> {
  const values = {
    email: String(formData.get("email") ?? "").trim(),
  };

  const parsed = forgotPasswordSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: PasswordResetFieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof PasswordResetValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Enter a valid email address to continue.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const redirectTo = await buildAuthRedirectUrl("/reset-password");
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  if (error) {
    return {
      error: error.message,
      values,
    };
  }

  return {
    success: `A password reset link was sent to ${parsed.data.email}.`,
    values,
  };
}

export async function resetPasswordAction(
  _: PasswordResetActionState,
  formData: FormData
): Promise<PasswordResetActionState> {
  const values = {
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const parsed = resetPasswordSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: PasswordResetFieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof PasswordResetValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Choose a valid new password and try again.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "The recovery link expired. Request a fresh password reset email.",
      values,
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      error: error.message,
      values,
    };
  }

  await supabase.auth.signOut();
  redirect("/login?reset=1");
}

export async function updateOwnerProfileAction(
  _: OwnerProfileActionState,
  formData: FormData
): Promise<OwnerProfileActionState> {
  const values = {
    fullName: String(formData.get("fullName") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };

  const parsed = ownerProfileSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors: OwnerProfileFieldErrors = {};

    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof OwnerProfileValues;
      if (!fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }

    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors,
      values,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      error: "Your session expired. Log in again to update your account.",
      values,
    };
  }

  const currentMetadata = user.user_metadata ?? {};
  const metadataPatch = {
    ...currentMetadata,
    full_name: parsed.data.fullName,
    owner_phone: parsed.data.phone || null,
  };

  const emailRedirectTo = await buildAuthRedirectUrl("/settings");
  const nextEmail = parsed.data.email;
  const newPassword = parsed.data.newPassword?.trim() ?? "";
  const emailChanged = nextEmail !== user.email;
  const passwordChanged = newPassword.length > 0;

  const { error: profileError } = await supabase.auth.updateUser(
    {
      email: emailChanged ? nextEmail : undefined,
      data: metadataPatch,
    },
    emailChanged ? { emailRedirectTo } : undefined
  );

  if (profileError) {
    return {
      error: profileError.message,
      values,
    };
  }

  if (passwordChanged) {
    const { error: passwordError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (passwordError) {
      return {
        error: passwordError.message,
        values,
      };
    }
  }

  let success = "Account updated.";
  if (emailChanged && passwordChanged) {
    success =
      "Account updated. Check your inbox to confirm the new email address.";
  } else if (emailChanged) {
    success = "Profile updated. Check your inbox to confirm the new email address.";
  } else if (passwordChanged) {
    success = "Profile updated. Your password has been changed.";
  }

  return {
    success,
    values: {
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone ?? "",
      newPassword: "",
      confirmPassword: "",
    },
  };
}
