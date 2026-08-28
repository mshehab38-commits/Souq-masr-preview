import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { ImageGallery } from "@/components/ui/ImageGallery";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt as string} data-testid="next-image" />;
  },
}));

describe("EmptyState / ErrorState / LoadingState", () => {
  it("EmptyState shows the title, description and action", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        title="لا توجد نتائج"
        description="جرّب تعديل الفلاتر"
        action={{ label: "إعادة الضبط", onClick }}
      />,
    );
    expect(screen.getByText("لا توجد نتائج")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إعادة الضبط" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("ErrorState shows the title", () => {
    render(<ErrorState title="حدث خطأ ما" />);
    expect(screen.getByText("حدث خطأ ما")).toBeInTheDocument();
  });

  it("LoadingState exposes a status role with a label", () => {
    render(<LoadingState label="جارٍ التحميل" />);
    expect(screen.getByRole("status")).toHaveTextContent("جارٍ التحميل");
  });
});

describe("ImageGallery", () => {
  it("shows a placeholder when there are no images", () => {
    render(<ImageGallery images={[]} alt="إعلان" />);
    expect(screen.getByText("لا توجد صور")).toBeInTheDocument();
  });

  it("switches the main image when a thumbnail is clicked", () => {
    render(
      <ImageGallery images={["/a.jpg", "/b.jpg", "/c.jpg"]} alt="إعلان" />,
    );
    const thumbnails = screen.getAllByRole("button");
    expect(thumbnails).toHaveLength(3);
    fireEvent.click(thumbnails[1] as HTMLElement);
    expect(thumbnails[1]).toHaveAttribute("aria-current", "true");
  });
});
