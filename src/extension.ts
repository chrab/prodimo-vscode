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
        vscode.languages.registerDocumentSymbolProvider(
            { scheme: "file", language: "prodimolog" },
            new ProDiMoLogDocumentSymbolProvider()
        )
    );


    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            { scheme: 'file', language: 'prodimoparam' },
            new ParameterNameCompletionProvider(context),
            '!', '.' // Optional: trigger character(s)
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

    // TODO: to make the code clearer, we could simply build all two or three lists at the beginning (when they are still empty. And the rest of the code just selects the list.)

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext) {
        // Return an array of CompletionItem objects
        let completionItems = [];

        const line = document.lineAt(position);
        // special case case for .true. and .false.
        if (context.triggerCharacter === ".") {
            if (line.text.substring(0, position.character).includes('!')) {
                return []; // ! in line so value is not expected here
            }
            else {
                // only suggest .true. and .false.
                // TODO: could be improved, one could already suggest .true.    ! paramnames
                // kind of keeping another list for the switches 
                var item = new vscode.CompletionItem('.true.', vscode.CompletionItemKind.Value);
                item.insertText = 'true. ';
                completionItems.push(item);
                item = new vscode.CompletionItem('.false.', vscode.CompletionItemKind.Value);
                item.insertText = 'false.     ';
                completionItems.push(item);
                return completionItems;
            }
        }

        // trigger kinds: 0 pressed ctrl+space , 1 pressed !;  

        // character is the index of the position in the line
        let endofline = (position.character === line.range.end.character);
        let triggerKind = context.triggerKind;
        const textBeforeCursor = line.text.substring(0, position.character);
        const lastTriggerPos = textBeforeCursor.lastIndexOf('!');
        // case were we have triggerKind 0, but ! is in the line, so we want to trigger as if ! was pressed
        if (triggerKind === 0 && lastTriggerPos >= 0) { // only if we have a ! in the line
            if ((line.text.substring(lastTriggerPos + 1).trim().length === 0)) { // only spaces after ! so it is fine
                triggerKind = 1;
            }
            else {
                return []; // something else after ! we stop
            }
        }

        if (triggerKind === 0) {
            // pressed ctrl+space ... suggest the parameters with ! so it is fine to have no ! in the line
            //if (lastTriggerPos === -1) {
            //    return []; // no trigger char found, no completion
            //}
            if (line.text.substring(0, lastTriggerPos).includes('!')) {
                return []; // another ! found, no completion
            }
            // have already filled it
            if (this.completionItems0.length > 0) {
                return this.completionItems0;
            }
        }
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

        const paramList = JSON.parse(fs.readFileSync(this.paramListPath, 'utf8'));

        // need to create the list
        for (const paramname of Object.keys(paramList)) {
            const param = paramList[paramname];

            if (param.desc === null) {
                param.desc = "";
            }

            let insertText = '';
            let name = ' ' + paramname; // default: triggered by !
            if (triggerKind === 0) {  // not triggered by ! but has ! in line, ist already checked before
                name = '! ' + paramname;
            }
            insertText += name + ' ';

            const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);

            if (endofline) {
                if (param.unit) {
                    //insertText += "   [" + param.unit + "]";
                    insertText += "   [" + param.unit + "] ";
                }
                if (param.desc.trim() !=="") {
                    insertText += "   : " + param.desc;
                }
            }
            
            //item.detail = param.type;
            item.detail = param.desc + "\n";
            item.documentation = new vscode.MarkdownString(`- **Type:** ${param.type}\n- **Default:** ${param.default}\n- **Unit:** [${param.unit}]`);
            //item.documentation = new vscode.MarkdownString(`- Description: ${param.description}\n- Type: ${param.type}\n- Unit: ${param.unit}\n- Default: ${param.default}`);
            item.insertText = insertText;
            completionItems.push(item);
        }
        // store the lists, not sure if this is good style, but it seems unneccessary to create it again and again
        if (triggerKind === 0) {
            // also explicitly add .true. and .false. to the list
            completionItems.push(new vscode.CompletionItem('.true.', vscode.CompletionItemKind.Value));
            completionItems.push(new vscode.CompletionItem('.false.', vscode.CompletionItemKind.Value));
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
};


class ProDiMoLogDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> {
        return new Promise((resolve, reject) => {
            const symbols: vscode.DocumentSymbol[] = [];
            //vscode.window.showInformationMessage('provideDocumentSymbols called');
            let heatcoolHook: DocumentSymbol | undefined = undefined;
            let chemistryHook: DocumentSymbol | undefined = undefined;
            let contRTHook: DocumentSymbol | undefined = undefined;

            symbols.push(new DocumentSymbol("INIT", "section", vscode.SymbolKind.Class, new vscode.Range(0, 0, 0, 0), new vscode.Range(0, 0, 0, 0)));

            for (let line = 0; line < document.lineCount; line++) {
                const textLine = document.lineAt(line);

                if (chemistryHook) {
                    if (textLine.text.startsWith("   max element conservation error   :")) {
                        symbols.push(new DocumentSymbol("CHEMISTRY END", "", vscode.SymbolKind.Class, textLine.range, textLine.range));
                        chemistryHook = undefined;
                    }
                }
                else if (contRTHook) {
                    if (textLine.text.startsWith(" RT total time=")) {
                        symbols.push(new DocumentSymbol("CONTINUUM RT END", "", vscode.SymbolKind.Class, textLine.range, textLine.range));
                        contRTHook = undefined;
                    }
                }

                var regex = new RegExp('^ {0,1}(INIT_[a-z0-9_]*)(?::|[ ])', 'i');
                var result = regex.exec(textLine.text);
                if (result) {
                    var sym = new DocumentSymbol(result[1], "", vscode.SymbolKind.Method, textLine.range, textLine.range);
                    symbols[0].children.push(sym);
                    if (result[1] === "INIT_HEATCOOL") {
                        heatcoolHook = sym;
                    }
                    else {
                        heatcoolHook = undefined;
                    }
                }
                if (heatcoolHook) {
                    const res = new RegExp("^ *(INIT SYS \\S*) ...").exec(textLine.text);
                    if (res) {
                        heatcoolHook.children.push(new DocumentSymbol(res[1], "", vscode.SymbolKind.Variable, textLine.range, textLine.range));
                    }
                }
                if (textLine.text.startsWith(" total INIT CPU time")) {
                    symbols[0].children.push(new DocumentSymbol("INIT END", "", vscode.SymbolKind.Method, textLine.range, textLine.range));
                }
                else if (textLine.text.startsWith(" CALCULATING MONOCHROMATIC FACE-ON SED ...")) {
                    symbols.push(new DocumentSymbol("SED", "", vscode.SymbolKind.Class, textLine.range, textLine.range));
                }
                else if (textLine.text.startsWith(" CHEMISTRY AND ENERGY BALANCE ...")) {
                    chemistryHook = new DocumentSymbol("CHEMISTRY START", "", vscode.SymbolKind.Class, textLine.range, textLine.range);
                    symbols.push(chemistryHook);
                }
                else if (textLine.text.startsWith(" SOLUTION OF CONTINUUM RADIATIVE TRANSFER ...")) {
                    contRTHook = new DocumentSymbol("CONTINUUM RT START", "", vscode.SymbolKind.Class, textLine.range, textLine.range);
                    symbols.push(contRTHook);
                }
                else if (textLine.text.startsWith(" Starting line ray-tracing...")) {
                    symbols.push(new DocumentSymbol("LINE TRANSFER", "", vscode.SymbolKind.Class, textLine.range, textLine.range));
                }
            }
            resolve(symbols);
        });
    }
};

// This method is called when your extension is deactivated
export function deactivate() { }
