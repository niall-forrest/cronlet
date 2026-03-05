import type { WebhookHandlerConfig } from "@cronlet/shared";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useState } from "react";

interface WebhookBuilderProps {
  value: WebhookHandlerConfig;
  onChange: (config: WebhookHandlerConfig) => void;
}

export function WebhookBuilder({ value, onChange }: WebhookBuilderProps) {
  const [useAuth, setUseAuth] = useState(!!value.auth);
  const [headersText, setHeadersText] = useState(
    value.headers ? JSON.stringify(value.headers, null, 2) : ""
  );
  const [bodyText, setBodyText] = useState(
    value.body ? JSON.stringify(value.body, null, 2) : ""
  );

  const update = (updates: Partial<WebhookHandlerConfig>) => {
    onChange({ ...value, ...updates });
  };

  return (
    <div className="space-y-4">
      {/* URL */}
      <div className="space-y-2">
        <Label>
          Webhook URL <span className="text-destructive">*</span>
        </Label>
        <Input
          value={value.url}
          onChange={(e) => update({ url: e.target.value })}
          placeholder="https://api.example.com/webhook"
        />
      </div>

      {/* Method */}
      <div className="space-y-2">
        <Label>Method</Label>
        <Select
          value={value.method ?? "POST"}
          onValueChange={(method: "GET" | "POST") => update({ method })}
        >
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="GET">GET</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Headers */}
      <div className="space-y-2">
        <Label>
          Headers <span className="text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          value={headersText}
          onChange={(e) => {
            setHeadersText(e.target.value);
            try {
              const parsed = e.target.value ? JSON.parse(e.target.value) : undefined;
              update({ headers: parsed });
            } catch {
              // Keep current value if invalid JSON
            }
          }}
          placeholder={'{\n  "X-Custom-Header": "value"\n}'}
          className="font-mono text-sm min-h-[80px]"
        />
      </div>

      {/* Body (only for POST) */}
      {(value.method ?? "POST") === "POST" && (
        <div className="space-y-2">
          <Label>
            Request Body <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            value={bodyText}
            onChange={(e) => {
              setBodyText(e.target.value);
              try {
                const parsed = e.target.value ? JSON.parse(e.target.value) : undefined;
                update({ body: parsed });
              } catch {
                // Keep current value if invalid JSON
              }
            }}
            placeholder={'{\n  "key": "value"\n}'}
            className="font-mono text-sm min-h-[100px]"
          />
          <p className="text-xs text-muted-foreground">
            Leave empty to send default payload with runId and taskId
          </p>
        </div>
      )}

      {/* Authentication */}
      <div className="space-y-3 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between">
          <Label className="cursor-pointer">Authentication</Label>
          <Switch
            checked={useAuth}
            onCheckedChange={(checked) => {
              setUseAuth(checked);
              if (!checked) {
                update({ auth: undefined });
              } else {
                update({
                  auth: { type: "bearer", secretName: "" },
                });
              }
            }}
          />
        </div>

        {useAuth && value.auth && (
          <div className="rounded-lg border border-border/50 bg-card/30 p-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Auth Type</Label>
              <Select
                value={value.auth.type}
                onValueChange={(type: "bearer" | "basic" | "header") =>
                  update({ auth: { ...value.auth!, type } })
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="basic">Basic Auth</SelectItem>
                  <SelectItem value="header">Custom Header</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">
                Secret Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={value.auth.secretName}
                onChange={(e) =>
                  update({ auth: { ...value.auth!, secretName: e.target.value } })
                }
                placeholder="MY_API_TOKEN"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                {value.auth.type === "bearer" && "Secret value will be sent as Bearer token"}
                {value.auth.type === "basic" && "Secret value will be base64 encoded for Basic auth"}
                {value.auth.type === "header" && "Secret value format: Header-Name: value"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
