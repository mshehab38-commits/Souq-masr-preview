import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge, VerifiedBadge } from "@/components/ui/Badge";
import { Rating } from "@/components/ui/Rating";
import { PriceTag } from "@/components/ui/PriceTag";

describe("Button", () => {
  it("renders its children and responds to clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>احفظ</Button>);
    const button = screen.getByRole("button", { name: "احفظ" });
    button.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disables the button and shows a spinner while loading", () => {
    render(<Button loading>احفظ</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});

describe("Input", () => {
  it("associates the label with the input", () => {
    render(<Input label="رقم الهاتف" />);
    expect(screen.getByLabelText("رقم الهاتف")).toBeInTheDocument();
  });

  it("marks the input invalid and shows the error message", () => {
    render(<Input label="رقم الهاتف" error="رقم غير صحيح" />);
    const input = screen.getByLabelText("رقم الهاتف");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("رقم غير صحيح")).toBeInTheDocument();
  });
});

describe("Card", () => {
  it("renders its children", () => {
    render(<Card>محتوى البطاقة</Card>);
    expect(screen.getByText("محتوى البطاقة")).toBeInTheDocument();
  });
});

describe("Badge", () => {
  it("renders arbitrary content", () => {
    render(<Badge tone="amber">مميز</Badge>);
    expect(screen.getByText("مميز")).toBeInTheDocument();
  });

  it("VerifiedBadge renders the verified label", () => {
    render(<VerifiedBadge />);
    expect(screen.getByText("موثّق")).toBeInTheDocument();
  });
});

describe("Rating", () => {
  it("exposes an accessible label with the numeric value and shows the count", () => {
    render(<Rating value={4.5} count={128} />);
    expect(screen.getByRole("img", { name: "تقييم 4.5 من 5" })).toBeInTheDocument();
    expect(screen.getByText("(128)")).toBeInTheDocument();
  });

  it("clamps out-of-range values into 0..5", () => {
    render(<Rating value={7} />);
    expect(screen.getByText("5.0")).toBeInTheDocument();
  });
});

describe("PriceTag", () => {
  it("formats the amount with grouping and the EGP suffix", () => {
    render(<PriceTag amount={125000} />);
    expect(screen.getByText("125,000")).toBeInTheDocument();
    expect(screen.getByText("ج.م")).toBeInTheDocument();
  });

  it("shows a negotiable label only when requested", () => {
    const { rerender } = render(<PriceTag amount={100} />);
    expect(screen.queryByText("قابل للتفاوض")).not.toBeInTheDocument();
    rerender(<PriceTag amount={100} negotiable />);
    expect(screen.getByText("قابل للتفاوض")).toBeInTheDocument();
  });
});
