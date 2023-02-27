const lineFeed = 10; //  '\n'
const carriageReturn = 13; //  '\r'
const space = 32;

function isNewLine(char: string) {
  const code = char.charCodeAt(0);
  return code === lineFeed || code === carriageReturn;
}

function isWhitespace(char: string) {
  const code = char.charCodeAt(0);
  return code === space;
}

interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
  row: number;
  col: number;
}

enum Sign {
  LeftParenthesis = "(",
  RightParenthesis = ")",
  LeftCurlyBrace = "{",
  RightCurlyBrace = "}",
  DollarSign = "$",
  GraveAccent = "`",
  DoubleQuotationMark = '"',
  Colon = ":",
  NumberSign = "#",
  Slash = "/",
}

enum TokenType {
  Whitespace = "whitespace",
  Word = "word",
  Keyword = "keyword",
  Sign = "sign",
}

class Tokenizer {
  input = "";
  index = 0;
  position = {
    row: 0,
    col: 0,
  };
  lastToken: Token | undefined;
  tokenList: Array<Token> = [];

  isKeyword(token: string) {
    return ["alias", "if", "else", "end", "branch", "goto"].includes(token);
  }

  isSign(char: string) {
    const signList = Object.values(Sign) as Array<string>;
    return signList.includes(char);
  }

  getSafeString(str: string, index: number) {
    return str[index] ?? "";
  }

  pushToken(type: TokenType, char: string) {
    if (
      this.lastToken &&
      this.lastToken.type === type &&
      [TokenType.Whitespace, TokenType.Word].includes(this.lastToken.type)
    ) {
      this.lastToken.value += char;
      this.lastToken.end++;
    } else {
      if (this.lastToken && this.isKeyword(this.lastToken.value)) {
        this.lastToken.type = TokenType.Keyword;
      }
      this.lastToken = {
        type,
        value: char,
        start: this.index,
        end: this.index + 1,
        row: this.position.row,
        col: this.position.col,
      };
      this.tokenList.push(this.lastToken);
      this.position.col++;
    }
    this.index++;
  }

  pushNewLine(char: string) {
    const next = this.getSafeString(this.input, this.index + 1);
    if (char !== next && isNewLine(next)) {
      this.index++;
    }
    this.position.row++;
    this.position.col = 0;
    this.index++;
    this.lastToken = undefined;
  }

  run(input: string) {
    this.input = input;
    while (this.index < input.length) {
      let char = input[this.index];
      switch (true) {
        case isNewLine(char):
          this.pushNewLine(char);
          break;
        case isWhitespace(char):
          this.pushToken(TokenType.Whitespace, char);
          break;
        case this.isSign(char):
          this.pushToken(TokenType.Sign, char);
          break;
        default:
          this.pushToken(TokenType.Word, char);
          break;
      }
    }
    return this.tokenList;
  }
}

export function tokenizer(input: string) {
  return new Tokenizer().run(input);
}
