import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
