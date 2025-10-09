// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { text } from 'stream/consumers';
import * as vscode from 'vscode';
import { DocumentSymbol } from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	//console.log('Congratulations, your extension "prodimo-vscode" is now active!');
 
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            {scheme: "file", language: "prodimoparam"}, 
            new ProDiMoParamDocumentSymbolProvider()
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

class ProDiMoParamDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(
        document: vscode.TextDocument,
        token: vscode.CancellationToken): Promise<vscode.DocumentSymbol[]> 
        {
        return new Promise((resolve, reject) => 
        {
            const symbols: vscode.DocumentSymbol[] = [];
            const nodes = [symbols];
            vscode.window.showInformationMessage('provideDocumentSymbols called');

            
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
export function deactivate() {}
