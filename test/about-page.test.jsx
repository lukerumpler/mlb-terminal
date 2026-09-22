import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AboutPage from "../client/src/pages/AboutPage.jsx";

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
  });

  it("calls onNavigate when the Overview breadcrumb is clicked", async () => {
    const user = userEvent.setup();
    const calls = [];
    const onNavigate = () => calls.push("overview");
    render(<AboutPage onNavigate={onNavigate} />);
    await user.click(screen.getByRole("button", { name: "Overview" }));
    expect(calls).toEqual(["overview"]);
  });
});
