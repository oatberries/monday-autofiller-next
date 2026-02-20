# Monday.com Legal Document Autofiller
Custom automation tool for generating populated legal documents directly from Monday.com board data.
> ⚠️ This is a client-specific implementation and is not a plug-and-play Monday application.

## Intended Use

This application was developed for a specific [Monday.com] workspace configuration.

It depends on:
- A predefined board structure
- Specific column mappings
- Preconfigured document templates

The app will not function correctly in other Monday environments without additional configuration and mappings.

## Key Capabilities

The autofiller enables users to:

- Retrieve case data directly from Monday items  
- Automatically populate legal document templates  
- Generate completed documents in seconds  
- Reduce manual entry errors  

## User Workflow

Typical usage flow:

1. Open a case item within the designated board  
2. Launch the Autofiller app from the item view  
3. Select one or more document templates  
4. Click **Fill & Download Selected Docs**  
5. Download the generated files

## Required Monday Configuration

This implementation expects certain Monday resources to exist.

### Boards

- `TRA Templates`

### Groups

- `Orders`

### Required Data Fields

The autofiller maps case data from specific columns, including:

- CSP  
- DR#  
- Type of Case  
- Petitioner  
- Respondent  
- Person To Be Served Address  

> Column titles and structure are expected to match the configured workspace.

## Technical Notes

- Built with React and the Monday SDK  
- Uses Monday GraphQL API for data retrieval  
- Document generation powered by Docxtemplater + PizZip
- Deployed on Vercel
