import { PlanContext } from "@/contexts/plan-context";
import { useContext } from "react";

export function usePlan() {
  return useContext(PlanContext);
}
