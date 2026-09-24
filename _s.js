jQuery.fn.sortElements = (function(){
    var sort = [].sort;
    return function(comparator, getSortable) {
        getSortable = getSortable || function(){return this;};
        var placements = this.map(function(){
            var sortElement = getSortable.call(this),
                parentNode = sortElement.parentNode,
                nextSibling = parentNode.insertBefore(
                    document.createTextNode(''),
                    sortElement.nextSibling
                );
            return function() {
                if (parentNode === this) {
                    throw new Error(
                        "You can't sort elements if any one is a descendant of another."
                    );
                }
                parentNode.removeChild(nextSibling);
                parentNode.insertBefore(this, nextSibling);
            };
        });
        return sort.call(this, comparator).each(function(i, element){
            var parentNode = $(this).parent();
            $(this).remove();
            parentNode.append(this);
        });
    };
})();

$(document).ready(function (){

  var ie6 = $.browser.msie && $.browser.version == 6;

  Date.prototype.toYMD = Date_toYMD;
  function Date_toYMD() {
    var year, month, day;
    year = String(this.getFullYear());
    month = String(this.getMonth() + 1);
    if (month.length == 1) {
	  month = "0" + month;
	}
	day = String(this.getDate());
	if (day.length == 1) {
	  day = "0" + day;
	}
	return year + "-" + month + "-" + day;
  }

  /* скрыть/показать основную форму */
  $('#sf-show').click(
    function() {
	  $(this).parent()
	    .toggleClass('open');
	  $(this)
	    .toggleClass('act');
	  return
	}
  );

  /* подсказка  к вопрсику */
  setupQuestTitle = function(oTitle){

    var questBox = document.createElement('span'),
        questBoxT = document.createElement('span'),
        questBoxB = document.createElement('span');

    $(questBox)
	  .addClass('quest-title')
	  .text(oTitle);
    $(questBoxT).addClass('quest-title-t');
    $(questBoxB).addClass('quest-title-b');

	return $(questBox).append($(questBoxT)).prepend($(questBoxB));
  }

  $('.quest').hover(
    function() {
	  $questTitle = setupQuestTitle($(this).attr('alt'));
	  $questTitle.css({
	    'left':$(this).position().left-7,'top':$(this).position().top+23
	  });
	  $(this).attr('alt','');
	  $(this).after($questTitle);
	},
    function() {
	  $(this).attr('alt',$questTitle.text());
	  $questTitle.hide('50');
	  $questTitle.remove();
	}
  );

  /* Фокус для полей ввода */
  $('form input[type=text]:not(.ft-disabled),form textarea,form input[type=password]').focus(
    function () {
      if ($(this).val() == $(this).attr('title')){
        $(this).val('');
      }
    }
  );
  $('form input[type=text]:not(.ft-disabled),form textarea,form input[type=password]').blur(
    function () {
      if (this.value == ''){
        $(this).val($(this).attr('title'));
      }
    }
  );

  /* кнопки down-up */
    function btnMouseDown(btnDownClass) {
      $('.'+btnDownClass).live('mousedown',
        function() {
          $(this).addClass(btnDownClass+'-down')
        }
      )
      .mouseup(
      );
      $('.'+btnDownClass).live('mouseup',
        function() {
          $(this).removeClass(btnDownClass+'-down')
        }
      )
      .mouseleave(
      );
      $('.'+btnDownClass).live('mouseleave',
        function() {
          $(this).removeClass(btnDownClass+'-down')
        }
      );
    }

    var arrayBtnDownClass = ['page-nave-prev1','page-nave-next1','page-nave-prev','page-nave-next','submit-big','submit','btn-calendar','ui-datepicker-trigger'];

    for (i=0;i<arrayBtnDownClass.length;i++) {
      btnMouseDown (arrayBtnDownClass[i])
    }

    $('.submit-disabled').live(
      'click',
      function() {
        return false
      }
    );
  /* end кнопки down-up */

  /* Статистические данные для депутата открыть\закрыть */
  if ($('#main').hasClass('p-link-status')) {
    $('.link-statis>div>span').click(
	  function()
          {
	    $(this).toggleClass('act');
            var stats = $(this).closest('.link-statis').next('.statis');
            if (stats.length > 0)
            {
                stats.toggle();
            }
            else
            {
                $('<div id="stats-load"><img src="/img/ajax.gif" width="24" height="24"/></div>').insertAfter('.link-statis');
                $.ajax({
                    url: statsUrl,
                    success: function(result)
                    {
                        $('#stats-load').remove();
                        $(result).insertAfter('.link-statis');
                        if ($('.table-data').length > 0)
                            renderDeputies();
                        activateTabs();
                    }
                })
            }
	  }
	);
  }

  function onCalendarSelect()
  {
      var from = $('#from').datepicker( "getDate" );
      var to =   $('#to').datepicker( "getDate" );
      if (from && to && from > to)
      {
          $('#from').datepicker( "setDate", to );
          $('#to').datepicker( "setDate", from );
      }
  }

    /* Изменение выпадающих списков при выборе созыва */
    $('#convocation').change(function(){
        $.ajax({
            url: '/dropdownlists/' + $(this).val(),
            data: {
                deputy:  $('#deputy').val(),
                faction: $('#faction').val()
            },
            success: function(value)
            {
				var defaultDate = new Date();
                convocationStartDate = value.startDate;
                convocationEndDate   = value.endDate;
				sessionDays          = value.days;
				if (convocationEndDate < defaultDate)
					defaultDate = convocationEndDate;

                $('#from').datepicker('option', {
                  changeMonth: true,
                      changeYear: true,
                      onChangeMonthYear: function(year, month, inst) {
                              setTimeout(initCalendarSelects, 30);
                      },
                      beforeShow: function() {
                            setTimeout(initCalendarSelects, 30);
                      },
                  minDate: convocationStartDate,
                  maxDate: convocationEndDate,
                  defaultDate: defaultDate,
                  showOn: 'button',
                  buttonText: '',
                  showAnim: $.browser.msie ? '' : 'fadeIn',
                  onSelect: onCalendarSelect
                });

                $('#to').datepicker('option', {
                  changeMonth: true,
                      changeYear: true,
                      onChangeMonthYear: function(year, month, inst) {
                              setTimeout(initCalendarSelects, 30);
                      },
                      beforeShow: function() {
                            setTimeout(initCalendarSelects, 30);
                      },
                  minDate: convocationStartDate,
                  maxDate: convocationEndDate,
                  defaultDate: defaultDate,
                  showOn: 'button',
                  buttonText: '',
                  showAnim: $.browser.msie ? '' : 'fadeIn',
                  onSelect: onCalendarSelect
                });

                $('#faction_wrap').html(value.factions);
                $('#deputy_wrap').html(value.deputies);
                $('#faction').selectbox();
                $('#deputy').selectbox({inputType: 'input'});
                updateDeputiesVisibility();
            }
        })
    });

    function updateDeputiesVisibility()
    {
        var fact = $('#faction').val();
        if (fact == '')
        {
            $('#deputy option').show();
            $('#deputy_container li').show();
        }
        else
        {
            var option = $('#deputy option:selected');
            if (!option.hasClass('fact' + fact))
            {
                $('#deputy').attr('selectedIndex', 0);
                $('#deputy').val(0);
                $('#deputy').each(function(){
                  var index = $(this).attr('selectedIndex');
                  var value = $('option:eq('+index+')', $(this)).html();
                  $(this).prev().prev().children().children().val(value);
                });
            }
            $('#deputy option:not(.fact' + fact + ')').hide();
            $('#deputy option[value=]').show();
            $('#deputy option.fact' + fact).show();
            $('#deputy_container li:not(.fact' + fact + ')').hide();
            $('#deputy_input_').show();
            $('#deputy_container li.fact' + fact).show();
        }
    }

    $('#faction').change(updateDeputiesVisibility);

    $('.select').selectbox();
    $('.input-select').selectbox({inputType: 'input'});
    $('.calendar-field').blur(onCalendarSelect);
    updateDeputiesVisibility();

    function initCalendars()
    {
        if (window.convocationStartDate === undefined) window.convocationStartDate = null;
        if (window.convocationEndDate === undefined) window.convocationEndDate = null;
      /* календарь */
        $('.calendar-field').mask('99.99.9999');
		var defaultDate = new Date();
		if (convocationEndDate < defaultDate)
			defaultDate = convocationEndDate;
        $('#from').datepicker({
          changeMonth: true,
              changeYear: true,
              onChangeMonthYear: function(year, month, inst) {
                      setTimeout(initCalendarSelects, 30);
              },
              beforeShow: function() {
                    setTimeout(initCalendarSelects, 30);
              },
          defaultDate: defaultDate,
          minDate: convocationStartDate,
          maxDate: convocationEndDate,
          showOn: 'button',
          buttonText: '',
          showAnim: $.browser.msie ? '' : 'fadeIn',
          onSelect: onCalendarSelect,
		  beforeShowDay: function(date)
		  {
			  if (sessionDays[date.toYMD()])
			  {
				  return [true, "session-day"];
			  }
			  else
			  {
				  return [true, ""];
			  }
		  }
        });
        $('#to').datepicker({
          changeMonth: true,
              changeYear: true,
              onChangeMonthYear: function(year, month, inst) {
                      setTimeout(initCalendarSelects, 30);
              },
              beforeShow: function() {
                    setTimeout(initCalendarSelects, 30);
              },
          defaultDate: defaultDate,
          minDate: convocationStartDate,
          maxDate: convocationEndDate,
          showOn: 'button',
          buttonText: '',
          showAnim: $.browser.msie ? '' : 'fadeIn',
          onSelect: onCalendarSelect,
		  beforeShowDay: function(date)
		  {
			  if (sessionDays[date.toYMD()])
			  {
				  return [true, "session-day"];
			  }
			  else
			  {
				  return [true, ""];
			  }
		  }
        });
    }

    /*~~~~~~~~~~ селекты в календаре ~~~~~~~~~~~~~~~~~~~~*/
    initCalendarSelects = function() {
      $('.ui-datepicker-month').selectbox({
        inputClass: 'month selectbox-small',
        containerClass: 'month selectbox-small-wrapper'
      });
      $('.ui-datepicker-year').selectbox({
        inputClass: 'year selectbox-small',
        containerClass: 'year selectbox-small-wrapper'
      });
    }

    initCalendars();

    /*$('#from').datepicker( 'option', 'minDate', convocationStartDate );
    $('#from').datepicker( 'option', 'maxDate', convocationEndDate );
    $('#to').datepicker( 'option', 'minDate', convocationStartDate );
    $('#to').datepicker( 'option', 'maxDate', convocationEndDate );*/

    /* ресет формы поиска */
    $('input.reset').live('click',
      function(){
        var form = $(this).closest('form');
        $('input[type=text]', form).val('');
        $('select', form).attr('selectedIndex', 0);
        $('select', form).val(0);
        $('select', form).each(function(){
          var index = $(this).attr('selectedIndex');
          var input = $(this).prev().prev().children().children();
          var value = $('option:eq('+index+')', $(this)).html();
          if (input[0].tagName == 'INPUT')
            input.val(value);
          else
            input.html(value);
        });
        return false;
      }
    );

    /* дизейблим кнопки при отправке формы */
    $('.search-form input[type=submit]').click(
    	function()
    	{
    		var form = this.form;
    		$('.submit-big', $(form)).addClass('submit-big-disabled');
    		$('.submit', $(form)).addClass('submit-disabled');
    	}
    );

    /*~~~~~~~~~~ пропуск пустых значений при отправке ~~~~~~~~~~~~~~~~~~~~*/
    manualNoEmptySubmit = function(form)
    {
      var data = form.serializeArray(), i, newData = {};
      for (i = 0; i < data.length; i++)
      {
        if (data[i].value != '')
          newData[data[i].name] = data[i].value;
      }
      var href = window.location.href;
      href = href.substr(0, href.lastIndexOf("?"));
      window.location = href + '?' + $.param(newData);
    }

    $('form.no-empty').live('submit', function(){
      manualNoEmptySubmit($(this));
      return false;
    });

    $('form.no-empty input[type=submit]').live('click', function(){
      manualNoEmptySubmit($(this.form));
      return false;
    });

    var adjustShadow = function()
    {
        $('.row-first').removeClass('row-first');
        $('tr.deputy:visible:first').addClass('row-first');
    };

    function getSortClass(field)
    {
        if (field == deputiesSortField)
        {
            if (deputiesSortDirection == 'desc')
                return 'data-sort-down';
            else
                return 'data-sort-up';
        }
        else
            return 'data-sort-def';
    }

    var renderDeputies = function()
    {
        var rows = [], i, len, parts = [], colCount = deputiesColumns.length;
        var inverse = (deputiesSortDirection == 'desc');
        var column;

        len = deputiesData.length;
        parts.push('<table><tr>');
        for (i = 0; i < colCount; i++)
        {
            column = deputiesColumns[i];
            parts.push(
                '<th class="' + getSortClass(column.sortField) +
                ((i == 0) ? ' th-first' : '') +
                (column.sortField ? '' : ' no-sort') +
                '"><a href="#"'+
                (column.sortField ? ' rel="' + column.sortField + '"' : '')
            );
			if (column.fadeTitle)
				parts.push(' title="' + column.fadeTitle + '"');
			parts.push('>' + column.title + ' <span>&nbsp;</span></a></th>');
        }
        parts.push('</tr>');
        for (i = 0; i < len; i++)
        {
            var rec = deputiesData[i];
            if (activeLetter !== null && activeLetter != rec.letter)
            	continue;
            if (activeFaction !== null && activeFaction != rec.factionCode)
            	continue;
            rows.push(rec);
        }

        rows.sort(function(a, b) {
            var text1, text2, v1, v2;
            if (deputiesSortField != 'sortName')
            {
                v1 = a[deputiesSortField];
                v2 = b[deputiesSortField];
                if (v1 < v2) return inverse ? 1 : -1;
                if (v1 > v2) return inverse ? -1 : 1;
            }
            text1 = a.sortName;
            text2 = b.sortName;
            if (text1 < text2) return inverse ? 1 : -1;
            if (text1 > text2) return inverse ? -1 : 1;
            return 0;
        });

        len = rows.length;
        for (i = 0; i < len; i++)
        {
            var j;
            rec = rows[i];
            parts.push('<tr' + ((i == 0) ? ' class="row-first"' : '') + '>');
            for (j = 0; j < colCount; j++)
            {
                column = deputiesColumns[j];
                var content;
                if (column.dataField)
                    content = rec[column.dataField];
                else if (column.renderer)
                    content = column.renderer(rec);
                parts.push(
                    '<td' + (column.width ?
                    (' width="' + column.width +'"') : '') +
                    '>' + content + '</td>'
                );
            }
            parts.push('</tr>');
        }
        parts.push('</table>');
		$('#selected-count').html(len);
        $('.table-data').html(parts.join(''));
    };

    /* Вкладки с депутатами */
    function activateTabs()
    {
        $('ul.tabs a').click(function(){
        	var li = $(this).closest('li'), act, right;
        	act = li.hasClass('act-tab');
        	right = li.hasClass('right');
            if (act && right)
        	{
	            $('ul.tabs li' + (right ? '.right' : '.left')).removeClass('act-tab');
        	}
            else
        	{
	            $('ul.tabs li' + (right ? '.right' : '.left')).removeClass('act-tab');
	            li.addClass('act-tab');
        	}
            var rel = $(this).attr('rel');

            if (right)
            {
            	if (act)
            		activeFaction = null;
            	else
	            	activeFaction = rel;
            }
            else
            {
	            if (rel == 'all')
	            {
	                activeLetter = null;
	            }
	            else if (rel.substring(0,6) === 'letter')
	            {
	                activeLetter = $(this).text();
	            }
				else
				{
					activeLetter = rel;
				}
            }
            renderDeputies();
            return false;
        });
    }

    $('.table-data th').live('click', function()
    {
        var field = $('a', this).attr('rel');

        if (!field)
            return false;

        if (field != deputiesSortField)
        {
            deputiesSortField = field;
            deputiesSortDirection = 'asc';
        }
        else
        {
            if (deputiesSortDirection == 'asc')
                deputiesSortDirection = 'desc';
            else
                deputiesSortDirection = 'asc';
        }

        renderDeputies();
        return false;
    });

    if ($('.table-data').length > 0)
        renderDeputies();
    activateTabs();
});