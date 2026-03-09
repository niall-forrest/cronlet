import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { MetadataEditorMode, MetadataEntry, TaskFormValues } from "@/components/task/task-form";
import { ArrowLeft, FloppyDisk } from "@phosphor-icons/react";
import { getTask, patchTask } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/Skeleton";
import {
  TaskDetailsOptionsSection,
  TaskHandlerEditor,
  TaskScheduleEditor,
  buildPatchTaskInput,
  createTaskFormValuesFromTask,
  getTaskFormErrors,
  hasBlockingErrors,
  metadataEntriesFromText,
} from "@/components/task";

interface TaskEditPageProps {
  taskId: string;
}

export function TaskEditPage({ taskId }: TaskEditPageProps) {
  const { data: task, isLoading, error } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => getTask(taskId),
  });

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/tasks/$taskId" params={{ taskId }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} className="mr-1" />
          Back to Task
        </Link>
        <Card className="border-destructive/50">
          <CardContent>
            <p className="text-sm text-destructive">Failed to load task: {(error as Error).message}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading || !task) {
    return <TaskEditSkeleton />;
  }

  if (task.handlerConfig.type === "code") {
    return (
      <div className="space-y-4">
        <Link to="/tasks/$taskId" params={{ taskId }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} className="mr-1" />
          Back to Task
        </Link>
        <Card className="border-border/50 bg-card/60">
          <CardHeader>
            <CardTitle>Edit Task</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Code handlers are not editable in the cloud UI yet. You can still manage this task from the detail page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <TaskEditForm key={`${task.id}-${task.updatedAt}`} taskId={taskId} initialValues={createTaskFormValuesFromTask(task)} taskName={task.name} />;
}

function TaskEditForm({
  taskId,
  taskName,
  initialValues,
}: {
  taskId: string;
  taskName: string;
  initialValues: TaskFormValues;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TaskFormValues>(initialValues);

  const patchMutation = useMutation({
    mutationFn: () => patchTask(taskId, buildPatchTaskInput(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate({ to: "/tasks/$taskId", params: { taskId } });
    },
  });

  const errors = getTaskFormErrors(form);

  const updateForm = (updates: Partial<TaskFormValues>) => {
    setForm((current) => ({ ...current, ...updates }));
  };

  const handleMetadataTextChange = (value: string) => {
    updateForm({
      metadataText: value,
      metadataEntries: metadataEntriesFromText(value),
    });
  };

  const handleMetadataEntriesChange = (entries: MetadataEntry[]) => {
    updateForm({ metadataEntries: entries });
  };

  const handleMetadataModeChange = (mode: MetadataEditorMode) => {
    updateForm({
      metadataMode: mode,
      metadataEntries: mode === "builder" ? metadataEntriesFromText(form.metadataText) : form.metadataEntries,
    });
  };

  const handleSubmit = () => {
    if (hasBlockingErrors(errors)) {
      return;
    }

    patchMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Link to="/tasks/$taskId" params={{ taskId }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} className="mr-1" />
        Back to Task
      </Link>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="display-title">Edit Task</h1>
          <p className="text-sm text-muted-foreground">{taskName}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/tasks/$taskId", params: { taskId } })}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={patchMutation.isPending || hasBlockingErrors(errors)}>
            <FloppyDisk size={16} className="mr-2" />
            {patchMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      <Card variant="flat">
        <CardHeader>
          <CardTitle>Handler</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskHandlerEditor
            handlerType={form.handlerType}
            toolsConfig={form.toolsConfig}
            webhookConfig={form.webhookConfig}
            onHandlerTypeChange={(handlerType) => updateForm({ handlerType })}
            onToolsConfigChange={(toolsConfig) => updateForm({ toolsConfig })}
            onWebhookConfigChange={(webhookConfig) => updateForm({ webhookConfig })}
          />
        </CardContent>
      </Card>

      <Card variant="flat">
        <CardHeader>
          <CardTitle>Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskScheduleEditor
            schedule={form.schedule}
            timezone={form.timezone}
            onScheduleChange={(schedule) => updateForm({ schedule })}
            onTimezoneChange={(timezone) => updateForm({ timezone })}
          />
        </CardContent>
      </Card>

      <Card variant="flat">
        <CardHeader>
          <CardTitle>Details & Options</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskDetailsOptionsSection
            mode="edit"
            values={form}
            errors={errors}
            onNameChange={(name) => updateForm({ name })}
            onDescriptionChange={(description) => updateForm({ description })}
            onActiveChange={(active) => updateForm({ active })}
            onRetryAttemptsChange={(retryAttempts) => updateForm({ retryAttempts })}
            onRetryBackoffChange={(retryBackoff) => updateForm({ retryBackoff })}
            onRetryDelayChange={(retryDelay) => updateForm({ retryDelay })}
            onTimeoutChange={(timeout) => updateForm({ timeout })}
            onCallbackUrlChange={(callbackUrl) => updateForm({ callbackUrl })}
            onMetadataModeChange={handleMetadataModeChange}
            onMetadataTextChange={handleMetadataTextChange}
            onMetadataEntriesChange={handleMetadataEntriesChange}
            onMaxRunsEnabledChange={(maxRunsEnabled) => updateForm({ maxRunsEnabled, maxRuns: maxRunsEnabled ? form.maxRuns : "" })}
            onMaxRunsChange={(maxRuns) => updateForm({ maxRuns })}
            onExpiresAtEnabledChange={(expiresAtEnabled) => updateForm({ expiresAtEnabled, expiresAt: expiresAtEnabled ? form.expiresAt : "" })}
            onExpiresAtChange={(expiresAt) => updateForm({ expiresAt })}
          />
        </CardContent>
      </Card>

      {patchMutation.error ? (
        <p className="text-sm text-destructive">Failed to save task: {(patchMutation.error as Error).message}</p>
      ) : null}
    </div>
  );
}

function TaskEditSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-52" />
      </div>
      {[1, 2, 3].map((section) => (
        <Card key={section} variant="flat">
          <CardHeader>
            <Skeleton className="h-5 w-28" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
