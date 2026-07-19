import { Command } from "cmdk";
import { ENTITIES } from "@/lib/entities";

export type View = "feed" | "markets" | "research" | "chanakya" | "calendar" | "watchlist";

export function CommandPalette({
  open,
  onClose,
  onNavigate,
  onTicker,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (v: View) => void;
  onTicker: (t: string) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-hairline bg-panel shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <Command label="Command palette" className="text-ink">
          <div className="border-b border-hairline px-3">
            <Command.Input
              autoFocus
              placeholder="Jump to a stock, a section, or a filter…"
              className="w-full bg-transparent py-3 text-[13.5px] outline-none placeholder:text-dim/60"
            />
          </div>
          <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
            <Command.Empty className="px-3 py-6 text-center text-[12px] text-dim">No matches.</Command.Empty>
            <Command.Group heading={<span className="section-eyebrow px-2">Sections</span>}>
              {(
                [
                  ["feed", "News feed"],
                  ["markets", "Markets toolkit"],
                  ["research", "Research Desk — Kimi's picks & deep dives"],
                  ["chanakya", "Chanakya Watch — speculation lab"],
                  ["calendar", "Economic calendar"],
                  ["watchlist", "Watchlist"],
                ] as [View, string][]
              ).map(([v, l]) => (
                <Command.Item
                  key={v}
                  value={l}
                  onSelect={() => {
                    onNavigate(v);
                    onClose();
                  }}
                  className="cursor-pointer rounded-md px-3 py-2 text-[13px] aria-selected:bg-marigold/10 aria-selected:text-marigold"
                >
                  {l}
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading={<span className="section-eyebrow px-2">Stocks</span>}>
              {ENTITIES.slice(0, 200).map((e) => (
                <Command.Item
                  key={e.ticker}
                  value={`${e.name} ${e.ticker}`}
                  onSelect={() => {
                    onTicker(e.ticker);
                    onClose();
                  }}
                  className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-[13px] aria-selected:bg-marigold/10"
                >
                  <span className="aria-selected:text-marigold">{e.name}</span>
                  <span className="font-mono-num text-[10.5px] text-dim">{e.ticker}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
