import {
  BookOpen,
  Brain,
  Cable,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";

export type ChatEmptySuggestion = {
  title: string;
  Icon: LucideIcon;
};

export const chatEmptySuggestions: ChatEmptySuggestion[] = [
  { title: "Recap everything I read this week", Icon: Brain },
  { title: "Analyze my reading habits this month", Icon: CalendarDays },
  { title: "Find connections between my saved articles", Icon: Cable },
  { title: "Summarize what I haven't read yet", Icon: BookOpen },
];
