import { ChartNoAxesCombined } from "lucide-react";

export function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-none border border-[#1e6ef3] bg-[#1e6ef3] text-white">
        <ChartNoAxesCombined className="size-6" aria-hidden="true" />
      </span>
      <span className="text-xl font-extrabold tracking-tight sm:text-2xl">
        Margin<span className="font-normal">Mind</span>
      </span>
    </span>
  );
}
