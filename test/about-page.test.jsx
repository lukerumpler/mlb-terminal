import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AboutPage, { isUsableProfileUrl } from "../client/src/pages/AboutPage.jsx";

beforeEach(() => {
  cleanup();
});

describe("AboutPage", () => {
  it("renders the builder profile content", () => {
    render(<AboutPage />);
    expect(screen.getByText("About the builder")).toBeInTheDocument();
    expect(screen.getByText("Lucas Rumpler")).toBeInTheDocument();
    expect(screen.getByText(/B\.A\. in Business & Statistics/)).toBeInTheDocument();
    expect(screen.getByText("Core skills")).toBeInTheDocument();
    expect(screen.getByText("How I evaluate")).toBeInTheDocument();
    expect(screen.getByText("Selected experience")).toBeInTheDocument();
    expect(screen.getByText("San Diego Padres")).toBeInTheDocument();
    expect(screen.getByText("lukerumpler@gmail.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("href", "https://www.linkedin.com/in/lucasrumpler/");
  });

  it("calls onNavigate when the Overview breadcrumb is clicked", async () => {
    const user = userEvent.setup();
    const calls = [];
    const onNavigate = () => calls.push("overview");
    render(<AboutPage onNavigate={onNavigate} />);
    await user.click(screen.getByRole("button", { name: "Overview" }));
    expect(calls).toEqual(["overview"]);
  });

  it("shows no dead LinkedIn link unless a real https URL is given", () => {
    const { container, rerender } = render(<AboutPage linkedInUrl="" />);
    expect(screen.queryByText(/LinkedIn/)).not.toBeInTheDocument();
    expect(container.querySelector('a[href="#"]')).toBeNull();

    rerender(<AboutPage linkedInUrl="https://www.linkedin.com/in/example" />);
    const link = screen.getByRole("link", { name: /LinkedIn/ });
    expect(link).toHaveAttribute("href", "https://www.linkedin.com/in/example");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));

    rerender(<AboutPage linkedInUrl="javascript:alert(1)" />);
    expect(screen.queryByText(/LinkedIn/)).not.toBeInTheDocument();
  });

  it("uses the bundled headshot by default and keeps the placeholder for an empty source", () => {
    const { rerender } = render(<AboutPage />);
    expect(screen.getByRole("img", { name: "Lucas Rumpler" })).toHaveAttribute("src", "/headshot.jpg");
    rerender(<AboutPage headshotSrc="" />);
    expect(screen.getByRole("img", { name: /headshot placeholder/ })).toBeInTheDocument();

    rerender(<AboutPage headshotSrc="/headshot.jpg" />);
    expect(screen.getByRole("img", { name: "Lucas Rumpler" })).toHaveAttribute("src", "/headshot.jpg");
    expect(screen.queryByRole("img", { name: /placeholder/ })).not.toBeInTheDocument();
  });

  it("only accepts https profile URLs", () => {
    expect(isUsableProfileUrl("https://linkedin.com/in/x")).toBe(true);
    for (const bad of ["", "#", "http://linkedin.com/in/x", "javascript:alert(1)", "linkedin.com/in/x", undefined]) {
      expect(isUsableProfileUrl(bad)).toBe(false);
    }
  });
});
