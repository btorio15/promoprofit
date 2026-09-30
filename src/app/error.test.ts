import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RouteError from "./error";

describe("RouteError", () => {
  const error = Object.assign(new Error("NeonDbError: secret-host.neon.tech password=x"), {
    digest: "123",
  });
  const html = renderToStaticMarkup(React.createElement(RouteError, { error, retry: () => {} }));

  it("shows a plain message and a retry button", () => {
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
  });

  it("never leaks error details", () => {
    expect(html).not.toContain("secret-host");
    expect(html).not.toContain("NeonDbError");
    expect(html.toLowerCase()).not.toContain("stack");
    expect(html).not.toContain("123");
  });
});
