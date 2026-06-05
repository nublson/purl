import { UsageContext } from "@/contexts/usage-context";
import { useContext } from "react";

export function useUsage() {
  return useContext(UsageContext);
}
