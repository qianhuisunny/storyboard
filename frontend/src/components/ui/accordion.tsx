import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AccordionContextValue {
  value: string[];
  toggle: (itemValue: string) => void;
}

const AccordionContext = React.createContext<AccordionContextValue | null>(null);

interface AccordionProps {
  type?: "single" | "multiple";
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  className?: string;
  children: React.ReactNode;
}

const Accordion = React.forwardRef<HTMLDivElement, AccordionProps>(
  ({ type = "multiple", defaultValue = [], className, children, ...props }, ref) => {
    const [value, setValue] = React.useState<string[]>(defaultValue);

    const toggle = React.useCallback(
      (itemValue: string) => {
        setValue((prev) => {
          if (type === "single") {
            return prev.includes(itemValue) ? [] : [itemValue];
          }
          return prev.includes(itemValue)
            ? prev.filter((v) => v !== itemValue)
            : [...prev, itemValue];
        });
      },
      [type]
    );

    return (
      <AccordionContext.Provider value={{ value, toggle }}>
        <div ref={ref} className={cn("divide-y", className)} {...props}>
          {children}
        </div>
      </AccordionContext.Provider>
    );
  }
);
Accordion.displayName = "Accordion";

const AccordionItemContext = React.createContext<string | null>(null);

interface AccordionItemProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

const AccordionItem = React.forwardRef<HTMLDivElement, AccordionItemProps>(
  ({ value, className, children, ...props }, ref) => {
    return (
      <AccordionItemContext.Provider value={value}>
        <div ref={ref} className={cn("py-2", className)} {...props}>
          {children}
        </div>
      </AccordionItemContext.Provider>
    );
  }
);
AccordionItem.displayName = "AccordionItem";

interface AccordionTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

const AccordionTrigger = React.forwardRef<HTMLButtonElement, AccordionTriggerProps>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(AccordionContext);
    const itemValue = React.useContext(AccordionItemContext);

    if (!context || !itemValue) {
      throw new Error("AccordionTrigger must be used within Accordion and AccordionItem");
    }

    const isOpen = context.value.includes(itemValue);

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "flex w-full items-center justify-between py-2 text-sm font-medium transition-all",
          className
        )}
        onClick={() => context.toggle(itemValue)}
        {...props}
      >
        {children}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
    );
  }
);
AccordionTrigger.displayName = "AccordionTrigger";

interface AccordionContentProps {
  className?: string;
  children: React.ReactNode;
}

const AccordionContent = React.forwardRef<HTMLDivElement, AccordionContentProps>(
  ({ className, children, ...props }, ref) => {
    const context = React.useContext(AccordionContext);
    const itemValue = React.useContext(AccordionItemContext);

    if (!context || !itemValue) {
      throw new Error("AccordionContent must be used within Accordion and AccordionItem");
    }

    const isOpen = context.value.includes(itemValue);

    if (!isOpen) return null;

    return (
      <div
        ref={ref}
        className={cn("overflow-hidden text-sm", className)}
        {...props}
      >
        <div className="pb-4 pt-0">{children}</div>
      </div>
    );
  }
);
AccordionContent.displayName = "AccordionContent";

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
