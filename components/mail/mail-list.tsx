import { ComponentProps, useMemo, useEffect, useRef, useState } from "react";
import { EmptyState, type FolderType } from "@/components/mail/empty-state";
import { preloadThread, useMarkAsRead } from "@/hooks/use-threads";
import { useSearchValue } from "@/hooks/use-search-value";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMail } from "@/components/mail/use-mail";
import { useSession } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { InitialThread } from "@/types";
import { cn } from "@/lib/utils";

interface MailListProps {
  items: InitialThread[];
  folder: string;
}

const HOVER_DELAY = 300; // ms before prefetching

const Thread = ({ message: initialMessage }: { message: InitialThread }) => {
  const [message, setMessage] = useState(initialMessage);
  const [mail, setMail] = useMail();
  const { markAsRead } = useMarkAsRead();
  const { data: session } = useSession();
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isHovering = useRef<boolean>(false);
  const hasPrefetched = useRef<boolean>(false);
  const [searchValue] = useSearchValue();

  const isMailSelected = useMemo(() => message.id === mail.selected, [message.id, mail.selected]);

  const highlightText = (text: string, highlight: string) => {
    if (!highlight?.trim()) return text;

    const regex = new RegExp(`(${highlight})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, i) => {
      return i % 2 === 1 ? (
        <span
          key={i}
          className="ring-0.5 mx-0.5 inline-flex items-center justify-center rounded bg-black px-1 py-0.5 text-white ring-yellow-300/70 dark:bg-white dark:text-black dark:ring-yellow-300/50"
        >
          {part}
        </span>
      ) : (
        part
      );
    });
  };

  const handleMailClick = async () => {
    if (isMailSelected) {
      setMail({
        selected: null,
      });
    } else {
      setMail({
        ...mail,
        selected: message.id,
      });
      try {
        const response = await fetch(`/api/v1/mail/${message.id}/read`, {
          method: "POST",
        });
        if (response.ok) {
          setMessage((prev) => ({ ...prev, unread: false }));
          await markAsRead(message.id);
        } else {
          console.error("Failed to mark message as read");
        }
      } catch (error) {
        console.error("Error marking message as read:", error);
      }
    }
  };

  const handleMouseEnter = () => {
    isHovering.current = true;
    if (session?.user.id && !hasPrefetched.current) {
      // Clear any existing timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }

      // Set new timeout for prefetch
      hoverTimeoutRef.current = setTimeout(() => {
        if (isHovering.current) {
          // Only prefetch if still hovering and hasn't been prefetched
          console.log(`🕒 Hover threshold reached for email ${message.id}, initiating prefetch...`);
          preloadThread(session.user.id, message.id);
          hasPrefetched.current = true;
        }
      }, HOVER_DELAY);
    }
  };

  const handleMouseLeave = () => {
    isHovering.current = false;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
  };

  // Reset prefetch flag when message changes
  useEffect(() => {
    hasPrefetched.current = false;
  }, [message.id]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      onClick={handleMailClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      key={message.id}
      className={cn(
        "group flex cursor-pointer flex-col items-start border-b px-4 py-4 text-left text-sm transition-all hover:bg-accent",
        message.unread && "",
        isMailSelected ? "bg-accent" : "",
      )}
    >
      <div className="flex w-full flex-col gap-1">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2">
            <p
              className={cn(
                message.unread ? "font-bold" : "font-medium",
                "text-md flex items-center gap-1 opacity-70 group-hover:opacity-100",
              )}
            >
              {highlightText(message.sender.name, searchValue.highlight)}
              {message.unread ? <span className="ml-1 size-2 rounded-full bg-blue-500" /> : null}
            </p>
          </div>
          <p className="pr-2 text-xs font-normal opacity-70 group-hover:opacity-100">
            {new Date(message.receivedOn).toLocaleDateString()}
          </p>
        </div>
        <p className="mt-1 text-xs font-medium opacity-70 group-hover:opacity-100">
          {highlightText(message.title, searchValue.highlight)}
        </p>
      </div>
      <MailLabels labels={message.tags} />
    </div>
  );
};

export function MailList({ items, folder }: MailListProps) {
  // TODO: add logic for tags filtering & search
  const isEmpty = items.length === 0;

  if (isEmpty) {
    return <EmptyState folder={folder as FolderType} className="min-h-[90vh] md:min-h-[90vh]" />;
  }

  return (
    <ScrollArea className="h-full" type="auto">
      <div className="flex flex-col pt-0">
        {items.map((item) => (
          <Thread key={item.id} message={item} />
        ))}
      </div>
    </ScrollArea>
  );
}

function MailLabels({ labels }: { labels: string[] }) {
  if (!labels.length) return null;

  return (
    <div className={cn("mt-2 flex select-none items-center gap-2")}>
      {labels.map((label) => (
        <Badge key={label} className="rounded-md" variant={getDefaultBadgeStyle(label)}>
          <p className="text-xs font-medium lowercase opacity-70">{label.replace(/_/g, " ")}</p>
        </Badge>
      ))}
    </div>
  );
}

function getDefaultBadgeStyle(label: string): ComponentProps<typeof Badge>["variant"] {
  return "outline";

  // TODO: styling for each tag type
  switch (true) {
    case label.toLowerCase() === "work":
      return "default";
    case label.toLowerCase().startsWith("category_"):
      return "outline";
    default:
      return "secondary";
  }
}
