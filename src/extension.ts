// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DocumentSymbol } from 'vscode';
import * as fs from 'fs';
import * as path from 'path';


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    //console.log('Congratulations, your extension "prodimo-vscode" is now active!');

    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { scheme: "file", language: "prodimoparam" },
            new ProDiMoParamDocumentSymbolProvider()
        )
    );

    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'prodimoparam' },
            new ParameterNameCompletionProvider(context),
            '!' // Optional: trigger character(s)
        )
    );

    // // The command has been defined in the package.json file
    // // Now provide the implementation of the command with registerCommand
    // // The commandId parameter must match the command field in package.json
    // const disposable = vscode.commands.registerCommand('test.helloWorld', () => {
    // 	// The code you place here will be executed every time your command is executed
    // 	// Display a message box to the user
    // 	vscode.window.showInformationMessage('Hello World from prodimo-vscode3!');
    // });
    //
    // context.subscriptions.push(disposable);
}

class ParameterNameCompletionProvider implements vscode.CompletionItemProvider {
    private paramListPath: string;
    private completionItems0: vscode.CompletionItem[];
    private completionItems1: vscode.CompletionItem[];
    constructor(private context: vscode.ExtensionContext) {
        this.paramListPath = context.asAbsolutePath('paramlist.json');
        this.completionItems0 = [];
        this.completionItems1 = [];
    }
    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
        // Return an array of CompletionItem objects
        let completionItems = [];

        const line = document.lineAt(position);
        let endofline = (position.character === line.range.end.character); // character is the index of the position in the line
        let triggerKind = context.triggerKind;
        const textBeforeCursor = line.text.substring(0, position.character);
        const lastTriggerPos = textBeforeCursor.lastIndexOf('!');
        if (triggerKind === 0 && !line.text.substring(lastTriggerPos + 1).includes(' ')) {
            triggerKind = 1; // I am directly after a ! (no space or whatever, is like triggerKind1)
        }

        if (triggerKind === 0) {
            // find position of "! " starting
            if (lastTriggerPos === -1) {
                return []; // no trigger char found, no completion
            }
            // also if there is another ! before that no completion
            if (line.text.substring(0, lastTriggerPos).includes('!')) {
                return []; // another ! found, no completion
            }
            // have already filled it
            if (this.completionItems0.length > 0) {
                return this.completionItems0;
            }
        }

        // no else because triggerKind can be changed above
        else if (triggerKind === 1) {
            if (context.triggerKind !== 0) { // if this is zero special case trigger was not ! but we are in a situation like !kaslj;lkfj
                if (position.character - 1 !== 0 && line.text.substring(0, position.character - 1).includes('!')) {
                    return []; // another ! found, no completion
                }
            }
            if (line.text.substring(position.character).includes('!')) {
                return []; // another ! found, no completion
            }
            if (this.completionItems1.length > 0) {
                return this.completionItems1;
            }
        }

        const paramListRaw = fs.readFileSync(this.paramListPath, 'utf8');
        const paramList = JSON.parse(paramListRaw);


        // need to create the list
        for (const param of paramList.parameters) {
            let insertText = '';
            let name = "";
            if (triggerKind === 0) {  // not triggered by ! but has ! in line, ist already checked before
                name = '! ' + param.name;
                insertText += param.name + ' ';
            }
            else { // triggered by !
                name = param.name;
                insertText += ' ' + name + ' ';
            }

            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);

            if (endofline) {
                if (param.unit && param.unit !== '-') {
                    insertText += "   [" + param.unit + "]";
                }
                if (param.description) {
                    insertText += "   : " + param.description;
                }
            }

            //item.detail = param.type;
            item.detail = param.description;
            item.documentation = new vscode.MarkdownString(`- **Type:** ${param.type}\n- **Default:** ${param.default}\n- **Unit:** ${param.unit}`);
            //item.documentation = new vscode.MarkdownString(`- Description: ${param.description}\n- Type: ${param.type}\n- Unit: ${param.unit}\n- Default: ${param.default}`);
            item.insertText = insertText;
            completionItems.push(item);
        }
        // store the lists, not sure if this is good style, but it seems unneccessary to create it again and again
        if (triggerKind === 0) {
            this.completionItems0 = completionItems;
        }
        else if (triggerKind === 1) {
            this.completionItems1 = completionItems;
        }
        return completionItems;
    }
}


class ProDiMoParamDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
        return new Promise((resolve, reject) => {
            const symbols: vscode.DocumentSymbol[] = [];
            const nodes = [symbols];
            //vscode.window.showInformationMessage('provideDocumentSymbols called');

            for (let line = 0; line < document.lineCount; line++) {
                const textLine = document.lineAt(line);
                var regex = new RegExp('(^----*) \\b(\\S.*)\\b (----*)$');
                var result = regex.exec(textLine.text);
                if (result) {
                    const symbol = new DocumentSymbol(result[2], "block", vscode.SymbolKind.Method, textLine.range, textLine.range);
                    symbols.push(symbol);
                    //nodes[nodes.length - 1].push(symbol);                
                }
            }
            resolve(symbols);
        });
    }
}
// This method is called when your extension is deactivated
export function deactivate() { }
