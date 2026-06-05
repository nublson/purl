import ChatItem from "@/components/chat/chat-item";
import { chatEmptySuggestions } from "@/data/chat-empty-suggestions";
import { Logo } from "../logo";
import { Typography } from "../typography";

interface ChatEmptyProps {
  onSuggestion: (text: string) => void;
}

export const ChatEmpty = ({ onSuggestion }: ChatEmptyProps) => {
  return (
    <div className="flex-1 flex flex-col items-start justify-end gap-4 px-4">
      <div className="flex flex-col items-start justify-start gap-2">
        <Logo size={64} />
        <Typography component="h2" variant="h3">
          What magic shall we make happen?
        </Typography>
      </div>
      <div className="flex flex-col items-start justify-start gap-1 w-full">
        {chatEmptySuggestions.map(({ title, Icon }) => (
          <ChatItem
            key={title}
            title={title}
            icon={<Icon className="size-4" />}
            onClick={() => onSuggestion(title)}
          />
        ))}
      </div>
    </div>
  );
};
