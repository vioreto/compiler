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

type CollectorRule = (token: Token) => boolean | Collector;

class Collector {
  tokenList: Array<Token> = [];
  index = 0;
  complete = false;

  skipWhitespace = true;
  node!: Node;
  ruleList: Array<CollectorRule> = [];

  next(token: Token | Collector) {
    if (token instanceof Collector) {
      this.pushCollector(token);
      this.index++;
      return;
    }
    if (this.skipWhitespace && token.type == TokenType.Whitespace) return;
    const rule = this.ruleList[this.index]!;
    const match = rule(token);
    if (match instanceof Collector) {
      return match;
    }
    if (match) {
      this.tokenList.push(token);
    } else {
      throw new Error();
    }
    if (this.index == this.ruleList.length - 1) {
      this.complete = true;
    }
    this.index++;
  }

  pushCollector(c: Collector) {}

  compose() {}
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

  override ruleList: Array<CollectorRule> = [
    (t) => t.value == Keyword.Alias,
    (t) => t.type == TokenType.Word,
    (t) => t.value == Sign.Number,
    (t) => t.type == TokenType.Word,
    (t) => t.value == Sign.LeftParenthesis,
    () => new StringLiteralCollector(),
    (t) => t.value == Sign.RightParenthesis,
  ];

  override pushCollector(c: Collector) {
    if (c instanceof StringLiteralCollector) {
      const [_, packed] = this.node.body;
      packed.body.value = c.node.value;
    }
  }

  override compose() {
    const [aliasValue, packedValue] = this.tokenList.filter(
      (t) => t.type == TokenType.Word
    );
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

  override ruleList: CollectorRule[] = [
    (t) => t.value == Sign.DoubleQuotationMark,
    (t) => t.type == TokenType.Word,
    (t) => t.value == Sign.DoubleQuotationMark,
  ];

  override compose() {
    const { value } = this.tokenList[1]!;
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
          collector.compose();
          collectorStack.pop();
          const last = collectorStack.at(-1);
          if (last) {
            last.next(collector);
            collector = last
            node = collector.node
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
