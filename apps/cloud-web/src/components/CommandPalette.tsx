import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  MagnifyingGlass,
  House,
  ListChecks,
  ClockCounterClockwise,
  Gear,
  Plus,
  ArrowRight,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { listTasks } from "@/lib/api";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  type: "navigation" | "task" | "action";
  icon: React.ReactNode;
  title: string;
  description?: string;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => listTasks(),
    enabled: open,
  });

  // Build command items
  const allItems = useMemo<CommandItem[]>(() => {
    const navigationItems: CommandItem[] = [
      {
        id: "nav-overview",
        type: "navigation",
        icon: <House size={16} weight="duotone" />,
        title: "Go to Overview",
        description: "Dashboard overview",
        keywords: ["home", "dashboard"],
        action: () => {
          navigate({ to: "/" });
          setOpen(false);
        },
      },
      {
        id: "nav-tasks",
        type: "navigation",
        icon: <ListChecks size={16} weight="duotone" />,
        title: "Go to Tasks",
        description: "View all tasks",
        keywords: ["jobs", "schedules"],
        action: () => {
          navigate({ to: "/tasks" });
          setOpen(false);
        },
      },
      {
        id: "nav-runs",
        type: "navigation",
        icon: <ClockCounterClockwise size={16} weight="duotone" />,
        title: "Go to Runs",
        description: "Execution history",
        keywords: ["history", "executions", "logs"],
        action: () => {
          navigate({ to: "/runs" });
          setOpen(false);
        },
      },
      {
        id: "nav-settings",
        type: "navigation",
        icon: <Gear size={16} weight="duotone" />,
        title: "Go to Settings",
        description: "Secrets & API keys",
        keywords: ["secrets", "api", "keys", "config"],
        action: () => {
          navigate({ to: "/settings" });
          setOpen(false);
        },
      },
    ];

    const actionItems: CommandItem[] = [
      {
        id: "action-create-task",
        type: "action",
        icon: <Plus size={16} weight="bold" />,
        title: "Create new task",
        description: "Set up a new scheduled task",
        keywords: ["new", "add"],
        action: () => {
          navigate({ to: "/tasks/create" });
          setOpen(false);
        },
      },
    ];

    const taskItems: CommandItem[] = tasks.map((task) => ({
      id: `task-${task.id}`,
      type: "task" as const,
      icon: <ArrowRight size={16} />,
      title: task.name,
      description: task.description ?? undefined,
      keywords: [task.handlerType],
      action: () => {
        navigate({ to: "/tasks/$taskId", params: { taskId: task.id } });
        setOpen(false);
      },
    }));

    return [...actionItems, ...navigationItems, ...taskItems];
  }, [tasks, navigate]);

  // Filter items based on search
  const filteredItems = useMemo(() => {
    if (!search.trim()) {
      return allItems;
    }

    const query = search.toLowerCase();
    return allItems.filter((item) => {
      const titleMatch = item.title.toLowerCase().includes(query);
      const descMatch = item.description?.toLowerCase().includes(query);
      const keywordMatch = item.keywords?.some((k) => k.toLowerCase().includes(query));
      return titleMatch || descMatch || keywordMatch;
    });
  }, [allItems, search]);

  // Group filtered items
  const groupedItems = useMemo(() => {
    const groups: { label: string; items: CommandItem[] }[] = [];

    const actions = filteredItems.filter((i) => i.type === "action");
    const navigation = filteredItems.filter((i) => i.type === "navigation");
    const taskResults = filteredItems.filter((i) => i.type === "task");

    if (actions.length > 0) {
      groups.push({ label: "Actions", items: actions });
    }
    if (navigation.length > 0) {
      groups.push({ label: "Navigation", items: navigation });
    }
    if (taskResults.length > 0) {
      groups.push({ label: "Tasks", items: taskResults.slice(0, 5) });
    }

    return groups;
  }, [filteredItems]);

  // Flatten for keyboard navigation
  const flatItems = useMemo(
    () => groupedItems.flatMap((g) => g.items),
    [groupedItems]
  );

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Keyboard shortcut to open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    // Also listen for custom event from header button
    const handleOpenPalette = () => setOpen(true);

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("openCommandPalette", handleOpenPalette);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("openCommandPalette", handleOpenPalette);
    };
  }, []);

  // Handle keyboard navigation inside palette
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % flatItems.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + flatItems.length) % flatItems.length);
          break;
        case "Enter":
          e.preventDefault();
          if (flatItems[selectedIndex]) {
            flatItems[selectedIndex].action();
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
      }
    },
    [flatItems, selectedIndex]
  );

  // Reset state when closing
  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSearch("");
      setSelectedIndex(0);
    }
  };

  // Track cumulative index for highlighting
  let cumulativeIndex = 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="p-0 gap-0 !w-[640px] !max-w-[calc(100vw-32px)] overflow-hidden rounded-2xl border-border/50">
        {/* Search input */}
        <div className="flex items-center gap-4 px-5 border-b border-border/50">
          <MagnifyingGlass size={20} className="text-muted-foreground shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search tasks, navigate..."
            className="flex-1 bg-transparent py-5 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="max-h-[400px] overflow-y-auto p-3">
          {groupedItems.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No results found
            </div>
          ) : (
            groupedItems.map((group) => {
              const groupStartIndex = cumulativeIndex;
              cumulativeIndex += group.items.length;

              return (
                <div key={group.label} className="mb-3 last:mb-0">
                  <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((item, itemIndex) => {
                      const globalIndex = groupStartIndex + itemIndex;
                      const isSelected = globalIndex === selectedIndex;

                      return (
                        <button
                          key={item.id}
                          onClick={item.action}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className={cn(
                            "flex w-full items-center gap-4 rounded-xl px-4 py-3 text-left transition-colors",
                            isSelected
                              ? "bg-primary/10 text-foreground"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
                              isSelected ? "bg-primary/15 text-primary" : "bg-muted/50"
                            )}
                          >
                            {item.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">
                              {item.title}
                            </div>
                            {item.description && (
                              <div className="text-xs text-muted-foreground truncate mt-0.5">
                                {item.description}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <kbd className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
                              ↵
                            </kbd>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border/50 px-4 py-2 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border/50 bg-muted/50 px-1">↑</kbd>
              <kbd className="rounded border border-border/50 bg-muted/50 px-1">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border/50 bg-muted/50 px-1">↵</kbd>
              select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/50 bg-muted/50 px-1">esc</kbd>
            close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
