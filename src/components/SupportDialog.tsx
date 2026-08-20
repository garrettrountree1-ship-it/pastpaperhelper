import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LifeBuoy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { listMySupportMessages, sendSupportMessage } from "@/lib/admin.functions";

/** Lets any signed-in user message the platform owner and read replies. */
export function SupportDialog() {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const queryClient = useQueryClient();
  const send = useServerFn(sendSupportMessage);

  const messages = useQuery({
    queryKey: ["my-support-messages"],
    queryFn: useServerFn(listMySupportMessages),
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: () => send({ data: { body } }),
    onSuccess: () => {
      toast.success("Message sent to the PastPaperHelper.AI team");
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["my-support-messages"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <LifeBuoy className="size-4" />
          <span className="hidden sm:inline">Help</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Contact the PastPaperHelper.AI team</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            rows={5}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Tell us what you need help with"
          />
          {(messages.data ?? []).length > 0 ? (
            <div className="divide-y text-sm">
              {(messages.data ?? []).map((message) => (
                <div key={message.id} className="py-2">
                  <p className="whitespace-pre-wrap">{message.body}</p>
                  {message.reply ? (
                    <p className="mt-1 rounded-md bg-muted p-2">Reply: {message.reply}</p>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">Awaiting a reply</p>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || body.trim().length < 4}>
            Send message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
