"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/Logo";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const OTP_REQUEST_ERRORS: Record<string, string> = {
  invalid_phone: "رقم الهاتف غير صحيح — يجب أن يكون رقم موبايل مصري",
  rate_limited: "محاولات كثيرة، حاول مرة أخرى بعد قليل",
};

const OTP_VERIFY_ERRORS: Record<string, string> = {
  invalid_phone: "رقم الهاتف غير صحيح",
  no_active_code: "انتهت صلاحية الطلب، اطلب رمزًا جديدًا",
  expired: "انتهت صلاحية الرمز، اطلب رمزًا جديدًا",
  incorrect_code: "الرمز غير صحيح",
  too_many_attempts: "محاولات كثيرة، اطلب رمزًا جديدًا",
};

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRequestOtp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(OTP_REQUEST_ERRORS[data.error] ?? "حدث خطأ ما، حاول مرة أخرى");
        return;
      }
      setStep("otp");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(OTP_VERIFY_ERRORS[data.error] ?? "حدث خطأ ما، حاول مرة أخرى");
        return;
      }
      router.push("/profile");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-6 px-4">
      <Logo size={40} />
      <Card className="w-full">
        {step === "phone" ? (
          <form onSubmit={handleRequestOtp} className="flex flex-col gap-4">
            <h1 className="font-cairo text-lg font-bold text-neutral-900">تسجيل الدخول</h1>
            <Input
              label="رقم الهاتف"
              type="tel"
              inputMode="tel"
              placeholder="01xxxxxxxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={error ?? undefined}
              required
            />
            <Button type="submit" loading={loading} fullWidth>
              إرسال الرمز
            </Button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
            <h1 className="font-cairo text-lg font-bold text-neutral-900">أدخل رمز التحقق</h1>
            <p className="text-sm text-neutral-500">تم إرسال رمز مكوّن من 6 أرقام إلى {phone}</p>
            <Input
              label="رمز التحقق"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              error={error ?? undefined}
              required
            />
            <Button type="submit" loading={loading} fullWidth disabled={code.length !== 6}>
              تأكيد
            </Button>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setCode("");
                setError(null);
              }}
              className="text-sm text-teal-700 hover:underline"
            >
              تغيير رقم الهاتف
            </button>
          </form>
        )}
      </Card>
    </main>
  );
}
