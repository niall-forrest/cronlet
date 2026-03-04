import { useState, useEffect } from "react";
import type { ScheduleConfig } from "@cronlet/cloud-shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ScheduleType = "every" | "daily" | "weekly" | "monthly" | "once" | "cron";
type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAYS: { value: DayOfWeek; label: string; short: string }[] = [
  { value: "mon", label: "Monday", short: "M" },
  { value: "tue", label: "Tuesday", short: "T" },
  { value: "wed", label: "Wednesday", short: "W" },
  { value: "thu", label: "Thursday", short: "T" },
  { value: "fri", label: "Friday", short: "F" },
  { value: "sat", label: "Saturday", short: "S" },
  { value: "sun", label: "Sunday", short: "S" },
];

const INTERVALS = [
  { value: "1m", label: "1 minute" },
  { value: "5m", label: "5 minutes" },
  { value: "15m", label: "15 minutes" },
  { value: "30m", label: "30 minutes" },
  { value: "1h", label: "1 hour" },
  { value: "2h", label: "2 hours" },
  { value: "6h", label: "6 hours" },
  { value: "12h", label: "12 hours" },
  { value: "1d", label: "24 hours" },
];

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
];

interface ScheduleBuilderProps {
  value: ScheduleConfig;
  onChange: (config: ScheduleConfig) => void;
  timezone: string;
  onTimezoneChange: (tz: string) => void;
}

export function ScheduleBuilder({
  value,
  onChange,
  timezone,
  onTimezoneChange,
}: ScheduleBuilderProps) {
  const [scheduleType, setScheduleType] = useState<ScheduleType>(value.type);
  const [showAdvanced, setShowAdvanced] = useState(value.type === "cron");

  // Local state for each schedule type
  const [interval, setInterval] = useState(
    value.type === "every" ? value.interval : "15m"
  );
  const [dailyTimes, setDailyTimes] = useState<string[]>(
    value.type === "daily" ? value.times : ["09:00"]
  );
  const [weeklyDays, setWeeklyDays] = useState<DayOfWeek[]>(
    value.type === "weekly" ? value.days : ["mon"]
  );
  const [weeklyTime, setWeeklyTime] = useState(
    value.type === "weekly" ? value.time : "09:00"
  );
  type MonthlyDay = number | "last" | "last-fri" | "last-mon" | "last-tue" | "last-wed" | "last-thu" | "last-sat" | "last-sun";
  const [monthlyDay, setMonthlyDay] = useState<MonthlyDay>(
    value.type === "monthly" ? value.day : 1
  );
  const [monthlyTime, setMonthlyTime] = useState(
    value.type === "monthly" ? value.time : "09:00"
  );
  const [onceAt, setOnceAt] = useState(
    value.type === "once" ? value.at : new Date().toISOString().slice(0, 16)
  );
  const [cronExpression, setCronExpression] = useState(
    value.type === "cron" ? value.expression : "0 9 * * *"
  );

  // Build config when inputs change
  useEffect(() => {
    let config: ScheduleConfig;

    switch (scheduleType) {
      case "every":
        config = { type: "every", interval };
        break;
      case "daily":
        config = { type: "daily", times: dailyTimes };
        break;
      case "weekly":
        config = { type: "weekly", days: weeklyDays, time: weeklyTime };
        break;
      case "monthly":
        config = { type: "monthly", day: monthlyDay, time: monthlyTime };
        break;
      case "once":
        config = { type: "once", at: new Date(onceAt).toISOString() };
        break;
      case "cron":
        config = { type: "cron", expression: cronExpression };
        break;
    }

    onChange(config);
  }, [
    scheduleType,
    interval,
    dailyTimes,
    weeklyDays,
    weeklyTime,
    monthlyDay,
    monthlyTime,
    onceAt,
    cronExpression,
    onChange,
  ]);

  const toggleDay = (day: DayOfWeek) => {
    if (weeklyDays.includes(day)) {
      if (weeklyDays.length > 1) {
        setWeeklyDays(weeklyDays.filter((d) => d !== day));
      }
    } else {
      setWeeklyDays([...weeklyDays, day]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Schedule Type Selection */}
      <div className="space-y-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Frequency
        </Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {(["every", "daily", "weekly", "monthly", "once"] as const).map((type) => (
            <Button
              key={type}
              type="button"
              variant={scheduleType === type ? "default" : "outline"}
              size="sm"
              className={cn(
                "capitalize transition-all",
                scheduleType === type && "ring-2 ring-primary/20"
              )}
              onClick={() => {
                setScheduleType(type);
                setShowAdvanced(false);
              }}
            >
              {type}
            </Button>
          ))}
          <Button
            type="button"
            variant={showAdvanced ? "default" : "ghost"}
            size="sm"
            className="text-muted-foreground"
            onClick={() => {
              setScheduleType("cron");
              setShowAdvanced(true);
            }}
          >
            Custom
          </Button>
        </div>
      </div>

      {/* Schedule Type Specific Inputs */}
      <div className="rounded-lg border border-border/50 bg-card/30 p-4 space-y-4">
        {scheduleType === "every" && (
          <div className="space-y-2">
            <Label>Run every</Label>
            <Select value={interval} onValueChange={setInterval}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVALS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {scheduleType === "daily" && (
          <div className="space-y-3">
            <Label>Run at</Label>
            <div className="flex flex-wrap gap-2">
              {dailyTimes.map((time, idx) => (
                <div key={idx} className="flex items-center gap-1">
                  <Input
                    type="time"
                    value={time}
                    onChange={(e) => {
                      const newTimes = [...dailyTimes];
                      newTimes[idx] = e.target.value;
                      setDailyTimes(newTimes);
                    }}
                    className="w-28"
                  />
                  {dailyTimes.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setDailyTimes(dailyTimes.filter((_, i) => i !== idx))
                      }
                    >
                      ×
                    </Button>
                  )}
                </div>
              ))}
              {dailyTimes.length < 4 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDailyTimes([...dailyTimes, "12:00"])}
                >
                  + Add time
                </Button>
              )}
            </div>
          </div>
        )}

        {scheduleType === "weekly" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Days</Label>
              <div className="flex gap-1">
                {DAYS.map((day) => (
                  <Button
                    key={day.value}
                    type="button"
                    variant={weeklyDays.includes(day.value) ? "default" : "outline"}
                    size="sm"
                    className={cn(
                      "w-10 h-10 p-0 font-medium",
                      weeklyDays.includes(day.value) && "ring-2 ring-primary/20"
                    )}
                    onClick={() => toggleDay(day.value)}
                    title={day.label}
                  >
                    {day.short}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>At</Label>
              <Input
                type="time"
                value={weeklyTime}
                onChange={(e) => setWeeklyTime(e.target.value)}
                className="w-28"
              />
            </div>
          </div>
        )}

        {scheduleType === "monthly" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Day of month</Label>
              <Select
                value={String(monthlyDay)}
                onValueChange={(v) =>
                  setMonthlyDay(v.startsWith("last") ? (v as MonthlyDay) : Number(v))
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d}
                    </SelectItem>
                  ))}
                  <SelectItem value="last">Last day</SelectItem>
                  <SelectItem value="last-fri">Last Friday</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>At</Label>
              <Input
                type="time"
                value={monthlyTime}
                onChange={(e) => setMonthlyTime(e.target.value)}
                className="w-28"
              />
            </div>
          </div>
        )}

        {scheduleType === "once" && (
          <div className="space-y-2">
            <Label>Run at</Label>
            <Input
              type="datetime-local"
              value={onceAt.slice(0, 16)}
              onChange={(e) => setOnceAt(e.target.value)}
              className="w-56"
            />
          </div>
        )}

        {scheduleType === "cron" && (
          <div className="space-y-2">
            <Label>Cron expression</Label>
            <Input
              type="text"
              value={cronExpression}
              onChange={(e) => setCronExpression(e.target.value)}
              placeholder="0 9 * * *"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Standard cron format: minute hour day month weekday
            </p>
          </div>
        )}
      </div>

      {/* Timezone */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Timezone
        </Label>
        <Select value={timezone} onValueChange={onTimezoneChange}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMON_TIMEZONES.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview */}
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm font-medium text-primary">
          {formatSchedulePreview(value, timezone)}
        </p>
      </div>
    </div>
  );
}

function formatSchedulePreview(config: ScheduleConfig, timezone: string): string {
  const tz = timezone === "UTC" ? "UTC" : timezone.split("/").pop()?.replace(/_/g, " ");

  switch (config.type) {
    case "every":
      return `Runs every ${config.interval.replace(/(\d+)/, "$1 ").replace("m", "minutes").replace("h", "hours").replace("d", "days").replace("s", "seconds")}`;
    case "daily":
      return `Runs daily at ${config.times.join(", ")} (${tz})`;
    case "weekly": {
      const days = config.days.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ");
      return `Runs ${days} at ${config.time} (${tz})`;
    }
    case "monthly": {
      const day = typeof config.day === "number" ? `day ${config.day}` : config.day.replace("-", " ");
      return `Runs on ${day} at ${config.time} (${tz})`;
    }
    case "once":
      return `Runs once at ${new Date(config.at).toLocaleString()}`;
    case "cron":
      return `Cron: ${config.expression} (${tz})`;
  }
}
