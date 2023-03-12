import { TokenType, Token, Keyword, Sign } from "./tokenizer";

enum Statement {
  Alias = "AliasStatement",
  Packed = "PackedStatement",
}

enum Literal {
  Alias = "AliasLiteral",
  String = "StringLiteral",
}

interface Node {
  type: string;
}

interface Program extends Node {
  type: "Program";
  body: Array<Node>;
}

interface AliasStatement extends Node {
  type: Statement.Alias;
  body: [AliasLiteral, PackedStatement];
}

interface PackedStatement extends Node {
  type: Statement.Packed;
  value: string;
  body: StringLiteral;
}

interface AliasLiteral extends Node {
  type: Literal.Alias;
  value: string;
}

interface StringLiteral extends Node {
  type: Literal.String;
  value: string;
}

abstract class Collector {
  protected tokenList: Array<Token> = [];
  complete = false;

  abstract node: Node;
  protected abstract validator: ReturnType<Validator["end"]>;

  protected pushToken = (t: Token) => this.tokenList.push(t);

  next(data: Token | Collector) {
    const result = this.validator.next(data);
    if (result instanceof Collector) {
      return result;
    }
    if (result) {
      this.complete = true;
      this.compose();
    }
  }

  protected abstract compose(): void;
}

class AliasStatementCollector extends Collector {
  override node: AliasStatement = {
    type: Statement.Alias,
    body: [
      {
        type: Literal.Alias,
        value: "",
      },
      {
        type: Statement.Packed,
        value: "",
        body: {
          type: Literal.String,
          value: "",
        },
      },
    ],
  };

  override validator = validator()
    .add(validator().value(Keyword.Alias))
    .add(validator().type(TokenType.Word, this.pushToken).whitespace())
    .add(validator().value(Sign.Number).whitespace())
    .add(validator().type(TokenType.Word, this.pushToken))
    .add(validator().value(Sign.LeftParenthesis))
    .add(
      validator()
        .collect(new StringLiteralCollector(), (c) => {
          const [_, packed] = this.node.body;
          packed.body.value = c.node.value;
        })
        .whitespace()
    )
    .add(validator().value(Sign.RightParenthesis).whitespace())
    .end();

  override compose() {
    const [aliasValue, packedValue] = this.tokenList;
    const [alias, packed] = this.node.body;
    alias.value = aliasValue!.value;
    packed.value = packedValue!.value;
  }
}

class StringLiteralCollector extends Collector {
  override node: StringLiteral = {
    type: Literal.String,
    value: "",
  };

  override validator = validator()
    .add(validator().value(Sign.DoubleQuotationMark))
    .add(
      validator()
        .token(
          (t) => t.value != Sign.DoubleQuotationMark,
          this.pushToken,
          () => {}
        )
        .wait((t) => t.value == Sign.DoubleQuotationMark)
    )
    .end();

  override compose() {
    const value = this.tokenList.map(({ value }) => value).join("");
    this.node.value = value;
  }
}

class Parser {
  index = 0;
  tokenList: Array<Token> = [];
  ast: Program = {
    type: "Program",
    body: [],
  };

  run(tokenList: Array<Token>) {
    this.tokenList = tokenList;
    const collectorStack: Array<Collector> = [];
    let node: Node | null = null;
    let collector: Collector | null = null;
    while (this.index < tokenList.length) {
      const token = tokenList[this.index++]!;
      if (node && collector) {
        const newCollector: Collector | undefined = collector.next(token);
        if (newCollector) {
          collector = newCollector;
          collectorStack.push(collector);
          node = collector.node;
          this.index--;
        }
        if (collector.complete) {
          collectorStack.pop();
          const last = collectorStack.at(-1);
          if (last) {
            last.next(collector);
            collector = last;
            node = collector.node;
          } else {
            this.ast.body.push(node);
            node = null;
            collector = null;
          }
        }
        continue;
      }
      switch (token.value) {
        case Keyword.Alias:
          collector = new AliasStatementCollector();
          collectorStack.push(collector);
          node = collector.node;
          this.index--;
          break;
        default:
          break;
      }
    }
    return this.ast;
  }
}

export function parser(tokenList: Array<Token>) {
  return new Parser().run(tokenList);
}

interface Rule {
  predicate: (t: Token) => boolean;
  positive: (t: Token) => void;
  negative: (t: Token) => void;
  collect?: (c: Collector) => void;
  wait?: (t: Token) => boolean;
  whitespace: boolean;
  collector?: Collector;
}

class Validator {
  private rule: Rule = {
    predicate: () => false,
    positive: () => {},
    negative: () => {
      throw new Error("Token not matched");
    },
    whitespace: false,
  };
  private ruleList: Array<Rule> = [];

  add(v: Validator) {
    this.ruleList.push(v.rule);
    return this;
  }

  collect<T extends Collector>(c: T, handler: (c: T) => void) {
    this.rule.collector = c;
    // @ts-ignore
    this.rule.collect = handler;
    return this;
  }

  token(
    predicate: (t: Token) => boolean,
    positive?: Rule["positive"],
    negative?: Rule["negative"]
  ) {
    this.rule.predicate = predicate;
    if (positive) {
      this.rule.positive = positive;
    }
    if (negative) {
      this.rule.negative = negative;
    }
    return this;
  }

  type(
    type: TokenType,
    positive?: Rule["positive"],
    negative?: Rule["negative"]
  ) {
    return this.token((t) => t.type == type, positive, negative);
  }

  value(
    value: string,
    positive?: Rule["positive"],
    negative?: Rule["negative"]
  ) {
    return this.token((t) => t.value == value, positive, negative);
  }

  whitespace() {
    this.rule.whitespace = true;
    return this;
  }

  wait(handler: (t: Token) => boolean) {
    this.rule.wait = handler;
    return this;
  }

  end() {
    return {
      next: (t: Token | Collector) => {
        const rule = this.ruleList.shift()!;
        if (t instanceof Collector) {
          rule.collect!(t);
          return;
        }
        if (rule.whitespace && t.type == TokenType.Whitespace) {
          this.ruleList.unshift(rule);
          return;
        }
        if (rule.collector) {
          this.ruleList.unshift(rule);
          return rule.collector;
        }
        if (rule.wait && !rule.wait(t)) {
          this.ruleList.unshift(rule);
        }
        if (rule.predicate(t)) {
          rule.positive(t);
        } else {
          rule.negative(t);
        }
        return this.ruleList.length == 0;
      },
    };
  }
}

function validator() {
  return new Validator();
}
