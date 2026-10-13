using System.Globalization;

namespace Windows12.Core;

/// <summary>
/// Kleiner Formel-Rechner (für Terminal und Assistent).
/// Unterstützt + - * / % ^, Klammern, Dezimalkomma und Funktionen wie sqrt, sin, cos, log.
/// </summary>
public sealed class MathEval
{
    readonly string _s;
    int _pos;

    MathEval(string s) => _s = s.Replace(" ", "").Replace(',', '.').Replace('×', '*').Replace('÷', '/').Replace(':', '/');

    public static bool TryEvaluate(string expression, out double result)
    {
        try
        {
            var p = new MathEval(expression);
            result = p.ParseExpression();
            if (p._pos != p._s.Length || double.IsNaN(result)) return false;
            return true;
        }
        catch
        {
            result = 0;
            return false;
        }
    }

    public static string Format(double value) =>
        Math.Abs(value) >= 1e15 || (Math.Abs(value) < 1e-6 && value != 0)
            ? value.ToString("G10", Sys.German)
            : Math.Round(value, 10).ToString("#,##0.##########", Sys.German);

    double ParseExpression()
    {
        var v = ParseTerm();
        while (_pos < _s.Length)
        {
            var c = _s[_pos];
            if (c == '+') { _pos++; v += ParseTerm(); }
            else if (c == '-') { _pos++; v -= ParseTerm(); }
            else break;
        }
        return v;
    }

    double ParseTerm()
    {
        var v = ParsePower();
        while (_pos < _s.Length)
        {
            var c = _s[_pos];
            if (c == '*') { _pos++; v *= ParsePower(); }
            else if (c == '/') { _pos++; v /= ParsePower(); }
            else if (c == '%') { _pos++; v %= ParsePower(); }
            else break;
        }
        return v;
    }

    double ParsePower()
    {
        var b = ParseUnary();
        if (_pos < _s.Length && _s[_pos] == '^')
        {
            _pos++;
            return Math.Pow(b, ParsePower());
        }
        return b;
    }

    double ParseUnary()
    {
        if (_pos < _s.Length && _s[_pos] == '-') { _pos++; return -ParseUnary(); }
        if (_pos < _s.Length && _s[_pos] == '+') { _pos++; return ParseUnary(); }
        return ParsePrimary();
    }

    double ParsePrimary()
    {
        if (_pos >= _s.Length) throw new FormatException();

        if (_s[_pos] == '(')
        {
            _pos++;
            var v = ParseExpression();
            if (_pos >= _s.Length || _s[_pos] != ')') throw new FormatException();
            _pos++;
            return v;
        }

        if (char.IsLetter(_s[_pos]))
        {
            var start = _pos;
            while (_pos < _s.Length && char.IsLetter(_s[_pos])) _pos++;
            var name = _s[start.._pos].ToLowerInvariant();
            switch (name)
            {
                case "pi": return Math.PI;
                case "e": return Math.E;
            }
            var arg = ParsePrimary();
            return name switch
            {
                "sqrt" or "wurzel" => Math.Sqrt(arg),
                "sin" => Math.Sin(arg * Math.PI / 180),
                "cos" => Math.Cos(arg * Math.PI / 180),
                "tan" => Math.Tan(arg * Math.PI / 180),
                "log" => Math.Log10(arg),
                "ln" => Math.Log(arg),
                "abs" => Math.Abs(arg),
                "round" => Math.Round(arg),
                _ => throw new FormatException(),
            };
        }

        var numStart = _pos;
        while (_pos < _s.Length && (char.IsDigit(_s[_pos]) || _s[_pos] == '.')) _pos++;
        if (numStart == _pos) throw new FormatException();
        return double.Parse(_s[numStart.._pos], CultureInfo.InvariantCulture);
    }
}
