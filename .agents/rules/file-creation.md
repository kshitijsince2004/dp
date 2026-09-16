# File Creation Rule

1. **Prioritize Existing Files**:
   - Before creating any new file for a prompt or feature request, ALWAYS perform a thorough review of the existing codebase.
   - Check if an existing component, module, service, page, or utility file can logically incorporate the requested functionality.
   - Create a new file ONLY when:
     - No existing file appropriate for the responsibility exists.
     - Adding to an existing file would violate modularity or single-responsibility principles.

2. **Architectural Balance**:
   - Do not force unrelated logic into an existing file simply to avoid creating a file. Use intelligent architectural judgment to place code where it cleanly belongs.
