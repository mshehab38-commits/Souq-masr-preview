import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Pagination } from "@/components/ui/Pagination";
import { FilterSelect, FilterPanel } from "@/components/ui/Filters";
import { Modal } from "@/components/ui/Modal";

describe("Pagination", () => {
  it("renders nothing when there is only one page", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("calls onPageChange with the target page number", () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("disables the previous button on the first page", () => {
    render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "الصفحة السابقة" })).toBeDisabled();
  });
});

describe("FilterSelect", () => {
  it("renders the provided options and reports changes", () => {
    const onChange = vi.fn();
    render(
      <FilterPanel>
        <FilterSelect
          label="المحافظة"
          value="cairo"
          options={[
            { value: "cairo", label: "القاهرة" },
            { value: "giza", label: "الجيزة" },
          ]}
          onChange={onChange}
        />
      </FilterPanel>,
    );
    fireEvent.change(screen.getByLabelText("المحافظة"), { target: { value: "giza" } });
    expect(onChange).toHaveBeenCalledWith("giza");
  });
});

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="عنوان">
        محتوى
      </Modal>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the title and children, and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="عنوان النافذة">
        محتوى النافذة
      </Modal>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("عنوان النافذة")).toBeInTheDocument();
    expect(screen.getByText("محتوى النافذة")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
