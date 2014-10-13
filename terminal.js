(function() {
    console.log("Hi everyone! Happy to see you here. :))");
    
    var app = angular.module('terminal', []);
    app.controller('NTZTerminalController', function($sce, $scope) {
        // ps1 is simply just a storage unit for the raw data, while securePs1 is the "trusted" copy
        $scope.ps1 = loadFromStorage('ps1') || '$';
        $scope.securePs1 = $sce.trustAsHtml($scope.ps1);
        
        $scope.commandAliases = {
            '?': 'help',
            su: 'sudo'
        };
        $scope.availableCommands = undefined;
        
        $scope.currentCommand = '';
        $scope.commandHistory = loadFromStorage("history") || [];
        
        // TODO: Hook these into local storage
        $scope.variables = loadFromStorage("variables") || {};
        $scope.files = loadFromStorage("files") || {};
        
        // contents is simply just a storage unit for the raw data, while secureContents is the "trusted" copy
        $scope.contents = '#\n# ' + colorize('TODO:', 'red') + ' generate this DEFAULT header somewhere\n#\n';
        $scope.secureContents = $sce.trustAsHtml($scope.contents);
        
        // Write to the output
        $scope.appendOutputForCommand = function(output) {
            if (!output.endsWith("\n")) {
                output += "\n";
            }
            $scope.contents += output;
            $scope.secureContents = $sce.trustAsHtml($scope.contents);
        }
        
        // This method runs the user entered commands in the fictious terminal
        $scope.runCommandFromPrompt = function($event) {
            var isEnterKey = $event.keyCode === 13;
            var isControlC = $event.ctrlKey && $event.keyCode === 3;
            if (!(isEnterKey || isControlC)) {
                return;
            }
            
            // Is this an empty submission?
            if ($scope.currentCommand === '') {
                return;
            }
            
            // First add the prompt (whatever that may be) and the current command to the output
            $scope.appendOutputForCommand($scope.securePs1 + ' ' + $scope.currentCommand);
            
            // Then we only want to "run" the command if it's a submit (ENTER) and not abort (CTRL+C)
            if (isEnterKey) {
                $scope.figureOutWhatToDo($scope.currentCommand);
            }
            
            // By unshifting the command history, we efficiently add the current command to index=0
            $scope.commandHistory.unshift($scope.currentCommand);
            $scope.currentCommand = '';
        };
        
        // This enables cool variable expansion. It may have flaws, but works most of the time.
        $scope.expandVariables = function(string) {
            var localReplaces = {};
            var self = $scope;
            var output = string;
            
            // Check for the occurence of a variable prefix
            if (output.indexOf('$') != -1) {
                // Pattern to match all the $VAR (but not \$VAR) we can find!
                var variablePattern = /\\?\$([A-Z0-9_]+)/ig;
                var potentialVariables = output.match(variablePattern) || [];
                var variableCount = potentialVariables.length;
                var validVariables = 0;
                
                // Loop over every variable found in the string, and try to resolve it against the ones set
                potentialVariables.forEach(function(variable) {
                    if (variable[0] !== '\\') {
                        var key = variable.substring(1);
                        if (self.variables.hasOwnProperty(key)) {
                            localReplaces[variable] = self.variables[key];
                            validVariables++;
                        } else {
                            localReplaces[variable] = '';
                        }
                    }
                });
                
                // Just output a new line if we weren't able to match the variables
                if (validVariables == 0) {
                    output += '\n';
                }
            
                // Remove any leading \ before non-expanded variables (\$VAR => $VAR)
                output = output.replace(/\\\$/g, '$');
            }
            
            // Actually substitute the variables in the output
            for (var key in localReplaces) {
                if (localReplaces.hasOwnProperty(key)) {
                    output = output.replace(new RegExp('\\' + key, "g"), localReplaces[key]);
                }
            }
            return output;
        }
        
        // Wrapper function to write to a file; modes: t(runcate) or a(ppend)
        $scope.writeToFile = function(file, output, mode) {
            if (!(file in $scope.files)) {
                $scope.files[file] = {type: 'file', contents: ''};   
            }
            
            // Truncate or append?!
            if (mode == 't') {
                $scope.files[file].contents = output;   
            } else {
                $scope.files[file].contents += output;       
            }
        }
        
        // Function to actually pipe the output to a file (if needed)
        $scope.pipeToFile = function(command, output) {
            if (output == undefined || typeof output != 'string') {
                return false;
            }
            
            // Remove any coloring
            output = output.replace(/<span class="\w+">([\w|\s\.]+)<\/span>/g, "$1");
            
            // Let's split the command into pieces
            var bits = command.split(' ');
            if (bits.length > 1) {
                // We can probably assume that the filename is last
                var file = bits[bits.length-1] || false;
                if (!file) {
                    return false;   
                }
                
                // We need to figure out if we're to truncate or append
                var indexOfFileTruncate = bits.lastIndexOf(">");
                var indexOfFileAppend = bits.lastIndexOf(">>");
                if (indexOfFileTruncate !== -1) {
                    $scope.writeToFile(file, output, 't');
                    return true;
                } else if (indexOfFileAppend !== -1) {
                    $scope.writeToFile(file, output, 'a');
                    return true;
                }
            }
            return false;
        }
        
        // Setup method that makes sure that the commands are available (should only be run once)
        $scope.setupAvailableCommands = function() {
            $scope.availableCommands = {
                help: {
                    about: 'This help text',
                    usage: 'help [<program>]',
                    run: $scope.getOutputForHelp
                },
                sudo: {
                    about: 'Execute commands with higher system access',
                    usage: 'sudo [<options>]',
                    run: $scope.getOutputForSuperUserCall
                },
                echo: {
                    about: 'Utility to print to the terminal',
                    usage: 'echo [<string/variable>]',
                    run: $scope.getOutputForEcho
                },
                set: {
                    about: 'Utility to set a variable in the terminal',
                    usage: 'set <KEY>=<VALUE>',
                    run: $scope.setVariableInTerminal
                },
                unset: {
                    about: 'Utility to unset a variable in the terminal',
                    usage: 'unset <KEY>',
                    run: $scope.unsetVariableInTerminal
                }, 
                clear: {
                    about: 'Utility to clear the terminal output',
                    usage: 'clear',
                    run: $scope.clearTheTerminal
                },
                uname: {
                    about: 'Utility to return info about the host',
                    usage: 'uname',
                    run: $scope.getOutputForUname
                },
                ls: {
                    about: 'Utility to list files in the directory',
                    usage: 'ls',
                    run: $scope.getFilesInTerminal
                },
                cowsay: {
                    about: 'Utility to output something as a cow',
                    usage: 'cowsay [<manuscript for the cow>]',
                    run: $scope.getOutputForCowsay
                },
                cat: {
                    about: 'Utility to output data from a file',
                    usage: 'cat <filename>',
                    run: $scope.getOutputForCat
                },
                env: {
                    about: 'Prints all the variables set in the environment',
                    usage: 'env [<optional filter for the name>]',
                    run: $scope.getOutputForEnv
                },
                history: {
                    about: 'Prints all the commands that have been run in this environment',
                    usage: 'history [<desired count>]',
                    run: $scope.getOutputForHistory
                },
                'clear-history': {
                    about: 'Clears the command history for this environment',
                    usage: 'clear-history',
                    run: $scope.clearHistory
                }
            };
        }
        
        // Awesome method to figure out what to do with a given command
        $scope.figureOutWhatToDo = function(command) {
            var splitUpCommand = command.split(" ");
            var program =  splitUpCommand[0].toLowerCase();
            var options = splitUpCommand.slice(1).join(" ");
            var output = '';
            
            if ($scope.availableCommands == undefined) {
                $scope.setupAvailableCommands();   
            }
            
            // Figure out whether or not we need to pipe to the file
            var expandedCommand = $scope.expandVariables(options);
            var shouldTruncateFile = expandedCommand.lastIndexOf('>>') !== -1;
            var shouldAddToFile = expandedCommand.lastIndexOf('>') !== -1;
            
            var sanitizedCommand = expandedCommand;
            if (shouldTruncateFile) {
                sanitizedCommand = expandedCommand.substring(0, expandedCommand.lastIndexOf('>>'));   
            } else if (shouldAddToFile) {
                sanitizedCommand = expandedCommand.substring(0, expandedCommand.lastIndexOf('>'));
            }
            
            // Let's see if the requested program 1) is available or 2) aliased to something available
            if (program in $scope.availableCommands) {
                output = $scope.availableCommands[program]['run'](sanitizedCommand) || '';   
            } else if (program in $scope.commandAliases) {
                var aliasedProgram = $scope.commandAliases[program];
                output = $scope.availableCommands[aliasedProgram]['run'](sanitizedCommand) || '';
            } else {
                output = "Unknown command: " + program;
            }
            
            // Either pipe to a file or just out to the terminal
            if (shouldAddToFile) {
                $scope.pipeToFile(expandedCommand, output);
            } else if (output) {
                $scope.appendOutputForCommand(output);
            }
        };
        
        // Prints out the help text for the user to read
        $scope.getOutputForHelp = function(specificProgram) {
            var output = '';
            var self = $scope;
            
            // Are we looking for the help for a specific "program" or not?
            if (specificProgram == '') {
                if (self.availableCommands) {
                    output += 'Programs:\n';
                    for (var key in self.availableCommands) {
                        output += key + " "; 
                    }
                    output += "\n\n";
                }

                if (self.commandAliases) {
                    output += 'Aliases:\n';
                    for (var key in self.commandAliases) {
                        output += key + ": " + self.commandAliases[key] + "; "; 
                    };
                }            
            } else {
                output = specificProgram + ': ';
                if (specificProgram in self.availableCommands) {
                    output += self.availableCommands[specificProgram].about + "\n";
                    output += 'Usage: ' + self.availableCommands[specificProgram].usage.escapeHtml();
                } else if (specificProgram in self.commandAliases) {
                    var aliasedProgram = self.commandAliases[specificProgram];
                    output += self.availableCommands[aliasedProgram].about + "\n";
                    output += 'Usage: ' + self.availableCommands[aliasedProgram].usage.escapeHtml();
                } else {
                    output += 'No matching entry found for "' + specificProgram + '"';   
                }
            }
            return output;
        }
        
        /* Start of custom methods that are to parse the given commands and do something useful */
        $scope.getOutputForSuperUserCall = function(options) {
            if (options === '') {
                return "No program specified to run as root.";
            } else {
                return 'Unable to run "' + options+ '" as root.';
            }
        }
        
        $scope.getOutputForEcho = function(options) {
            return options;
        }
        
        $scope.getOutputForUname = function(options) {
            // Note to self: WSM is short for AWESOME
            return 'WSM ninetwozero.com; Kernel Version 0.9.20';   
        }
        
        $scope.setVariableInTerminal = function(options) {
            if (options == '') {
                return 'No variable specified.';   
            }
            
            // We're expecting the format key=value...
            values = options.split('=')
            key = values[0];
            value = values.slice(1);
            
            // ...so if we don't find just one key=value pair, then something's wrong.
            if (values && values.length == 2) {
                $scope.variables[key] = value.toString();
                return '';
            } else {
                return 'Unable to set ' + key + ' to "' + value.join("=") + '"';
            }
        }
        
        $scope.unsetVariableInTerminal = function(variable) {
            if (variable == '') {
                return 'No variable specified.';   
            }
            
            if (variable in $scope.variables) {
                delete $scope.variables[variable];
            }
            return '';
        }
        
        // This clears the terminal output (via the binds)
        $scope.clearTheTerminal = function(options) {
            $scope.contents = '';   
            $scope.secureContents = ''; 
        }
        
        // This acts as an ls
        $scope.getFilesInTerminal = function(options) {
            var output = '';
            var files = $scope.files;
            var filenames = Object.keys(files);
            var currentAndParent = ['.', '..'];
            
            // Add the current dir to the listing
            files['.'] = {type: 'dir', contents: {}};
            files['..'] = {type: 'dir', contents: files['.']};
            
            // Generate a sorted (unique) list of filenames
            filenames.sort();
            filenames = currentAndParent.concat(filenames);
            filenames = filenames.filter(function(filename, index, self) {
                return self.indexOf(filename) === index;
            });
            
            // Output the files in the given directory
            filenames.forEach(function(name) {
                var file = files[name];
                switch (file.type) {
                    case 'dir':
                        output += colorize(name, 'green') + " ";
                        break;
                    
                    default:
                        output += name + " ";
                        break;
                }
            }); 
            return output;
        }
        
        $scope.getOutputForCowsay = function(options) {
            if (options == '') {
                options = 'No string specified';   
            }
            
            var lineLengthWithoutSeparators = 76;
            var speechBubble = '';
            var borderTop = '  ';
            var borderBottom = '  ';
            var contentLength = options.length;
            
            // Calculate how long the borders should be (max=lineLengthWithoutSeparators)
            var borderLength = contentLength > lineLengthWithoutSeparators? 
                lineLengthWithoutSeparators : 
                contentLength;
            
            // Prepare the borders (underline and overline)
            for (var i = 0; i < borderLength; i++) {
                borderTop += '_';   
                borderBottom += '&oline;';
            }

            // Build the actual contents of the speech bubble
            var charactersLeft = contentLength;
            var currentIndex = 0;
            while (charactersLeft > 76) {
                var content = options.substr(currentIndex, 76);
                speechBubble += '  ' + content + '\n';
                charactersLeft -= content.length;
                currentIndex += content.length;
            }
            
            // The leftovers need to be included too!
            if (charactersLeft > 0) {
                speechBubble += "  " + options.substr(currentIndex, charactersLeft) + '\n'; 
            }
            
            speechBubble = borderTop + "\n" + speechBubble + borderBottom + "\n"; 
            return speechBubble + 
                   '     \\   ^__^' + "\n" +
                   '      \\  (oo)\_______' + "\n" +
                   '     \    (__)\\       )\\/\\' + "\n" +
                   '     \        ||----w |' + "\n" +
                   '      \       ||     ||';    
        };
        
        // Functionality to output the contents of a file
        $scope.getOutputForCat = function(filename) {
            if (filename == '') {
                return "No filename specified.";   
            } else if (filename in $scope.files) {
                var file = $scope.files[filename];
                if (file.type === 'file') {
                    return file['contents'];
                } else if (file.type === 'dir') {
                    return 'Unable to cat a directory.';
                } else {
                    return 'Unable to open file for reading: ' + filename;
                }
            } else {
                return "File not found: " + filename;   
            }
        }
        
        // Prints all the environment variables setup in the "system"
        $scope.getOutputForEnv = function(filter) {
            var output = '';
            Object.keys($scope.variables).forEach(function(variable) {
                if (filter == '' || variable.startsWith(filter)) {
                    output += variable + '=' + $scope.variables[variable] + '\n';
                }
            });
            return output;
        };
        
        // Prints all the commands that have been run in this session
        $scope.getOutputForHistory = function(count) {
            var numberToDisplay = count || 30;
            var output = '';
            var currentIndex = 1;
            var historyLength = $scope.commandHistory.length;
            
            $scope.commandHistory.forEach(function(command) {
                if (currentIndex <= numberToDisplay) {
                    output += currentIndex + "  " + command + "\n"; 
                    currentIndex++;
                }
            });
            return output;
        };
        
        // Clears the $scope.commandHistory for the user
        $scope.clearHistory = function(options) {
            $scope.commandHistory = [];
        };
        
        // This will save to local storage
        window.onbeforeunload = function() {
            saveToStorage("ps1", $scope.ps1);
            saveToStorage("history", $scope.commandHistory);
            saveToStorage("variables", $scope.variables);
            saveToStorage("files", $scope.files);
        };
    });   

    // Enables color output in the <pre>
    colorize = function(string, colors) {    
        if (colors) {
            if (typeof colors === 'string') {
                colors = [colors];
            }
            return '<span class="' + colors.join(' ') + '">' + string + '</span>';
        } else {
            return string;   
        }
    };
    
    // Helper method to utilize the local storage
    loadFromStorage = function(key) {
        var value = localStorage.getItem(key) || false;
        if (value) {
            return JSON.parse(value);
        }
        return value;
    };
    saveToStorage = function(key, value) {
        if (key && value) {
            localStorage.setItem(key, JSON.stringify(value));
        } else {
            console.log("Unable to store '" + value + "' for key: " + key);   
        }
    };
    
    // Courtesy of everyone's favorite Jon Skeet
    String.prototype.endsWith = function(str) {
        var lastIndex = this.lastIndexOf(str);
        return (lastIndex != -1) && (lastIndex + str.length == this.length);
    };
    
    // Rough implementation of startsWith
    String.prototype.startsWith = function(str) {
        return this.indexOf(str) === 0;
    };
    
    // Quick sanitation of <> => &lt;&gt;
    String.prototype.escapeHtml = function() {
        var characters = {'<': '&lt;', '>': '&gt;'};
        return this.replace(/[<>]/g, function(character) {
            return characters[character] || character;
        });
    };
})();