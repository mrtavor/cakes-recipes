with open('index.html', 'r', encoding='utf-8') as f:
    html = f.read()

header_start = html.find('<header class="modal-header">')
calc_start = html.find('<!-- Calculator Panel (Hidden by default) -->')
body_start = html.find('<div id="modalBody" class="modal-body">')
body_end = html.find('</div>', html.find('<!-- JS injected recipe details')) + 6

header_html = html[header_start:calc_start]
calc_html = html[calc_start:body_start]
body_html = html[body_start:body_end]

new_modal_content = f"""      <div class="modal-main">
{header_html}{body_html}
      </div>
{calc_html}"""

html = html[:header_start] + new_modal_content + html[body_end:]

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)
