import type { Config, Data } from "@puckeditor/core";
import {
  componentConfig as buttonComponentConfig,
  defaultProps as buttonDefaultProps,
  type ButtonProps,
} from "@anvilkit/button";
import {
  componentConfig as inputComponentConfig,
  defaultProps as inputDefaultProps,
  type InputProps,
} from "@anvilkit/input";

export type DemoComponents = {
  Button: ButtonProps;
  Input: InputProps;
};

export const demoConfig: Config<DemoComponents> = {
  categories: {
    actions: {
      title: "Actions",
      components: ["Button"],
    },
    forms: {
      title: "Forms",
      components: ["Input"],
    },
  },
  components: {
    Button: buttonComponentConfig,
    Input: inputComponentConfig,
  },
};

export function createDemoData(): Data<DemoComponents> {
  return {
    root: {},
    content: [
      {
        type: "Button",
        props: {
          id: "button-primary",
          ...buttonDefaultProps,
        },
      },
      {
        type: "Input",
        props: {
          id: "input-email",
          ...inputDefaultProps,
        },
      },
    ],
  };
}
